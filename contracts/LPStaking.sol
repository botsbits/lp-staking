// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LPStaking is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stake {
        uint256 amount; // Amount of staked tokens provided by user
        uint256 rewardDebt; // Reward debt
        uint256 uncollectedReward; //Uncollected reward
    }

    // Precision factor for reward calculation
    uint256 public constant PRECISION_FACTOR = 10**12;

    // BITS token (token distributed)
    IERC20 public immutable BITS_TOKEN;

    // The staked token (i.e., Uniswap V2 WETH/BITS LP token)
    IERC20 public immutable STAKED_TOKEN;

    // Block number when rewards start
    uint256 public immutable START_BLOCK;

    // Accumulated tokens per share
    uint256 public accTokenPerShare;

    // Block number when rewards end
    uint256 public endBlock;

    // Block number of the last update
    uint256 public lastRewardBlock;

    // Tokens distributed per block (in BITS)
    uint256 public rewardPerBlock;

    // Stakes for users that stake tokens (stakedToken)
    mapping(address => Stake) public userStakes;

    event AdminRewardWithdraw(uint256 amount);
    event Deposit(address indexed user, uint256 amount, uint256 uncollectedRewardAdded);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardsCollected(address indexed user, uint256 collectedAmount);
    event NewRewardPerBlock(uint256 rewardPerBlock);
    event NewEndBlock(uint256 endBlock);
    event StakeWithdrawn(address indexed user, uint256 amount, uint256 uncollectedRewardAdded);

    /**
     * @notice Constructor
     * @param _stakedToken staked token address
     * @param _bitsToken reward token address
     * @param _startBlock start block
     * @param _rewardPerBlock reward per block (in BITS)
     * @param _endBlock end block
     */
    constructor(
        address _stakedToken,
        address _bitsToken,
        uint256 _startBlock,
        uint256 _rewardPerBlock,
        uint256 _endBlock
    ) {
        STAKED_TOKEN = IERC20(_stakedToken);
        BITS_TOKEN = IERC20(_bitsToken);
        START_BLOCK = _startBlock;
        rewardPerBlock = _rewardPerBlock;
        endBlock = _endBlock;

        lastRewardBlock = _startBlock;
    }

    /**
     * @notice Deposit staked tokens
     * @param amount amount to deposit (in stakedToken)
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Incorrect amount");

        _updatePool();

        uint256 pendingRewards;
        uint oldAmount = userStakes[msg.sender].amount;

        if (oldAmount > 0) {
            pendingRewards =
                ((oldAmount * accTokenPerShare) / PRECISION_FACTOR) -
                userStakes[msg.sender].rewardDebt;

            if (pendingRewards > 0) {
                userStakes[msg.sender].uncollectedReward += pendingRewards;
            }
        }

        STAKED_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        uint newAmount = oldAmount + amount;
        userStakes[msg.sender].amount = newAmount;
        userStakes[msg.sender].rewardDebt = (newAmount * accTokenPerShare) / PRECISION_FACTOR;

        emit Deposit(msg.sender, amount, pendingRewards);
    }

    function collectRewards() external nonReentrant {
        _updatePool();

        uint newAmount = (userStakes[msg.sender].amount * accTokenPerShare) / PRECISION_FACTOR;

        uint256 pendingRewards = newAmount - userStakes[msg.sender].rewardDebt;

        pendingRewards += userStakes[msg.sender].uncollectedReward;

        require(pendingRewards > 0, "No pending rewards");

        userStakes[msg.sender].rewardDebt = newAmount;
        userStakes[msg.sender].uncollectedReward = 0;
        BITS_TOKEN.safeTransfer(msg.sender, pendingRewards);

        emit RewardsCollected(msg.sender, pendingRewards);
    }

    /**
     * @notice Withdraw staked tokens and give up rewards
     * @dev Only for emergency. It does not update the pool.
     */
    function emergencyWithdraw() external nonReentrant whenPaused {
        uint256 userBalance = userStakes[msg.sender].amount;

        require(userBalance != 0, "No user stake");

        userStakes[msg.sender].amount = 0;
        userStakes[msg.sender].rewardDebt = 0;
        userStakes[msg.sender].uncollectedReward = 0;

        STAKED_TOKEN.safeTransfer(msg.sender, userBalance);

        emit EmergencyWithdraw(msg.sender, userBalance);
    }

    /**
     * @notice Withdraw staked tokens
     * @param amount amount to withdraw (in stakedToken)
     */
    function withdraw(uint256 amount) external nonReentrant {
        uint stakedAmount = userStakes[msg.sender].amount;

        require(
            (stakedAmount >= amount) && (amount > 0),
            "Incorrect amount"
        );

        _updatePool();

        uint256 pendingRewards = ((stakedAmount * accTokenPerShare) / PRECISION_FACTOR) - userStakes[msg.sender].rewardDebt;
        if (pendingRewards > 0) {
            userStakes[msg.sender].uncollectedReward += pendingRewards;
        }

        uint newAmount = userStakes[msg.sender].amount - amount;
        userStakes[msg.sender].amount = newAmount;
        userStakes[msg.sender].rewardDebt = (newAmount * accTokenPerShare) / PRECISION_FACTOR;

        STAKED_TOKEN.safeTransfer(msg.sender, amount);

        emit StakeWithdrawn(msg.sender, amount, pendingRewards);
    }

    /**
     * @notice Withdraw rewards (for admin)
     * @param amount amount to withdraw (in BITS_TOKEN)
     * @dev Only callable by owner.
     */
    function adminRewardWithdraw(uint256 amount) external onlyOwner {
        BITS_TOKEN.safeTransfer(msg.sender, amount);

        emit AdminRewardWithdraw(amount);
    }

    /**
     * @notice Pause
     * It allows calling emergencyWithdraw
     */
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /**
     * @notice Unpause
     */
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    function updateRewardPerBlock(uint256 newRewardPerBlock) external onlyOwner {
        if (block.number >= START_BLOCK) {
            _updatePool();
        }
        rewardPerBlock = newRewardPerBlock;

        emit NewRewardPerBlock(newRewardPerBlock);
    }

    function updateEndBlock(uint256 newEndBlock) external onlyOwner {
        if (block.number >= START_BLOCK) {
            _updatePool();
        }
        require(newEndBlock > block.number, "New endBlock less than current block");
        require(newEndBlock > START_BLOCK, "New endBlock less than start block");

        endBlock = newEndBlock;

        emit NewEndBlock(newEndBlock);
    }

    /**
     * @notice View function to see pending reward on frontend.
     * @param user address of the user
     * @return Pending reward
     */
    function calculatePendingRewards(address user) external view returns (uint256) {
        uint256 stakedTokenSupply = STAKED_TOKEN.balanceOf(address(this));

        if ((block.number > lastRewardBlock) && (stakedTokenSupply != 0)) {
            uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * rewardPerBlock;
            uint256 adjustedTokenPerShare = accTokenPerShare + (tokenReward * PRECISION_FACTOR) / stakedTokenSupply;

            return userStakes[user].uncollectedReward +(userStakes[user].amount * adjustedTokenPerShare) / PRECISION_FACTOR 
                - userStakes[user].rewardDebt;
        } else {
            return userStakes[user].uncollectedReward + (userStakes[user].amount * accTokenPerShare) / PRECISION_FACTOR 
                - userStakes[user].rewardDebt;
        }
    }

    /**
     * @notice Update reward variables of the pool to be up-to-date.
     */
    function _updatePool() internal {
        if (block.number <= lastRewardBlock) {
            return;
        }

        uint256 stakedTokenSupply = STAKED_TOKEN.balanceOf(address(this));

        if (stakedTokenSupply == 0) {
            lastRewardBlock = block.number;
            return;
        }

        uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * rewardPerBlock;

        if (tokenReward > 0) {
            accTokenPerShare = accTokenPerShare + ((tokenReward * PRECISION_FACTOR) / stakedTokenSupply);
        }

        if (lastRewardBlock <= endBlock) {
            lastRewardBlock = block.number;
        }
    }

    /**
     * @notice Return reward multiplier over the given "from" to "to" block.
     * @param from block to start calculating reward
     * @param to block to finish calculating reward
     * @return the multiplier for the period
     */
    function _getMultiplier(uint256 from, uint256 to) internal view returns (uint256) {
        if (to <= endBlock) {
            return to - from;
        } else if (from >= endBlock) {
            return 0;
        } else {
            return endBlock - from;
        }
    }
}

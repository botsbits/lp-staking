const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

describe("LPStaking", function () {

    let bit;
    let lpToken;
    let lpStaking;
    let startBlockNumber;
    
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let addrs;
    let specAddr;
  
    beforeEach(async function () {
      [owner, addr1, addr2, addr3, specAddr, ...addrs] = await ethers.getSigners();
      
      let LPToken = await ethers.getContractFactory("BurnableToken");
      lpToken = await LPToken.deploy("LP Token", "LPT");
  
      let Bit = await ethers.getContractFactory("Bits");
      bit = await Bit.deploy("Bit Token", "BIT", owner.address, BigNumber.from("1000000000000000000000000000000000"));
  
      startBlockNumber = await ethers.provider.getBlockNumber();
      let endBlock = (startBlockNumber + 1000);

      let LPStaking = await ethers.getContractFactory("LPStaking");
      lpStaking = await LPStaking.deploy(lpToken.address, bit.address, startBlockNumber, BigNumber.from("100"), endBlock);

      await bit.connect(owner).transfer(lpStaking.address, 100000);
      let remainingBalance = await bit.connect(owner).balanceOf(owner.address);
      await bit.connect(owner).transfer(addr3.address, remainingBalance);

      await lpToken.connect(owner).mint(owner.address, 1000);
      await lpToken.connect(owner).mint(addr1.address, 1000);
      await lpToken.connect(owner).mint(addr2.address, 1000);
      await lpToken.connect(owner).approve(lpStaking.address, 1000);
      await lpToken.connect(addr1).approve(lpStaking.address, 1000);
      await lpToken.connect(addr2).approve(lpStaking.address, 1000);

    });

    it("User should succesfully deposit lp tokens", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      await expect(lpStaking.connect(owner).deposit(1000)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 1000, 0);
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('1000,0,0');

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(0);
    });

    it("User should not incorrectly deposit lp tokens", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      await expect(lpStaking.connect(owner).deposit(0)).to.be.revertedWith("Incorrect amount");
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
    });

    it("User should not deposit when paused. Pause, unpause should be called by owner only", async function() {

      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, 0);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(900);

      await expect(lpStaking.connect(addr1).pause()).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(addr2).pause()).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(owner).pause()).to.emit(lpStaking, "Paused").withArgs(owner.address);

      await expect(lpStaking.connect(owner).deposit(100)).to.be.revertedWith("Pausable: paused");
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(900);

      await expect(lpStaking.connect(addr1).unpause()).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(addr2).unpause()).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(owner).unpause()).to.emit(lpStaking, "Unpaused").withArgs(owner.address);

      currentBlockNumber = await ethers.provider.getBlockNumber();
      let rewards = (currentBlockNumber - depositBlockNumber)*100
      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, rewards);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(200);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(800);

    });

    it("Rewards should be calculated right in various cases - 1 user redepositing several times", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, 0);
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('100,0,0');

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(900);

      await mineNBlocks(10);

      let currentBlockNumber1 = await ethers.provider.getBlockNumber();
      let rewards1 = (currentBlockNumber1 - depositBlockNumber)*100;
      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, rewards1);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      let debt1 = rewards1*2;
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal(`200,${debt1},${rewards1}`);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(200);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(800);

      await mineNBlocks(50);

      let currentBlockNumber2 = await ethers.provider.getBlockNumber();
      let rewards2 = (currentBlockNumber2 - currentBlockNumber1)*100;
      let totalRewards = rewards1 + rewards2;
      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, rewards2);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);

      let debt2 = debt1*2 + rewards2*2;
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal(`400,${debt2},${totalRewards}`);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(400);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(600);

    });

    it("Rewards should be calculated right in various cases - 1 user depositing very small redepositing very large amount", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(1)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 1, 0);
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('1,0,0');

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(1);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(999);

      await mineNBlocks(10);

      let currentBlockNumber1 = await ethers.provider.getBlockNumber();
      let rewards1 = (currentBlockNumber1 - depositBlockNumber)*100;
      await expect(lpStaking.connect(owner).deposit(799)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 799, rewards1);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      let debt1 = rewards1*800;
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal(`800,${debt1},${rewards1}`);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(800);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(200);

      await mineNBlocks(100);

      let currentBlockNumber2 = await ethers.provider.getBlockNumber();
      let rewards2 = (currentBlockNumber2 - currentBlockNumber1)*100;
      let totalRewards = rewards1 + rewards2;
      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, rewards2);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);

      let debt2 = Math.floor(debt1*9/8 + rewards2*9/8);
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal(`900,${debt2},${totalRewards}`);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(900);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(100);

    });

    it("Rewards should be calculated right in various cases - 3 users deposit alternatingly", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(10);

      let rewards1 = 10*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(200);
      let rewards3 = 200*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(10);
      let rewards4 = 10*100*210/400;
      let rewardsAddr1_3 = 10*100*90/400;
      let rewardsAddr2_2 = 10*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

    });

    it("Rewards should be collected right", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(10);

      let rewards1 = 10*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(200);
      let rewards3 = 200*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(10);
      let rewards4 = 10*100*210/400;
      let rewardsAddr1_3 = 10*100*90/400;
      let rewardsAddr2_2 = 10*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000);
      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, totalRewards+105);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, totalRewards2+90);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr2.address, totalRewards3+150);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000-totalRewards-totalRewards2-totalRewards3-345);
      expect(await bit.connect(owner).balanceOf(owner.address)).to.be.equal(totalRewards+105);
      expect(await bit.connect(owner).balanceOf(addr1.address)).to.be.equal(totalRewards2+90);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3+150);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(210);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(45);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, 315);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, 135);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr2.address, 150);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000-totalRewards-totalRewards2-totalRewards3-945);
      expect(await bit.connect(owner).balanceOf(owner.address)).to.be.equal(totalRewards+420);
      expect(await bit.connect(owner).balanceOf(addr1.address)).to.be.equal(totalRewards2+225);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3+300);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(210);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(45);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

    });

    it("Rewards should be collected right at the end of the staking period", async function() {
      // 9 block
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(100);

      let rewards1 = 100*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);
      // 211 block

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(500);
      // 712 block

      let rewards3 = 500*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(280);
      //993 block
      let rewards4 = 280*100*210/400;
      let rewardsAddr1_3 = 280*100*90/400;
      let rewardsAddr2_2 = 280*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000);
      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, totalRewards+105);
      // 995 block
      await mineNBlocks(4);
      // 999 block

      newTotalRewards = 262
      totalRewards2 += 157
      totalRewards3 += 175


      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, totalRewards3);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(newTotalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);


      await mineNBlocks(500);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(newTotalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, newTotalRewards);
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, totalRewards2);
      await expect(lpStaking.connect(addr2).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr2.address, totalRewards3);

      await mineNBlocks(500);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000-totalRewards - newTotalRewards - 105 - totalRewards2-totalRewards3);
      expect(await bit.connect(owner).balanceOf(owner.address)).to.be.equal(totalRewards + newTotalRewards + 105);
      expect(await bit.connect(owner).balanceOf(addr1.address)).to.be.equal(totalRewards2);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3);

      await expect(lpStaking.connect(owner).withdraw(210)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,210,0);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).withdraw(90)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr1.address,90,0);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).withdraw(200)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr2.address,200,0);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      await expect(lpStaking.connect(addr2).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 200, 0);
      await mineNBlocks(500);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);
      await expect(lpStaking.connect(addr2).withdraw(200)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr2.address,200,0);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3);

    });

    it("Rewards should be collected right at the end of the staking period - 2", async function() {
      // 9 block
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(100);

      let rewards1 = 100*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);
      // 211 block

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(500);
      // 712 block

      let rewards3 = 500*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(280);
      //993 block
      let rewards4 = 280*100*210/400;
      let rewardsAddr1_3 = 280*100*90/400;
      let rewardsAddr2_2 = 280*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000);
      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, totalRewards+105);
      // 995 block
      await mineNBlocks(4);
      // 999 block

      newTotalRewards = 262
      totalRewards2 += 157
      totalRewards3 += 175

      await mineNBlocks(500);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(newTotalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, newTotalRewards);
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, totalRewards2);
      await expect(lpStaking.connect(addr2).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr2.address, totalRewards3);

      await mineNBlocks(500);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000-totalRewards - newTotalRewards - 105 - totalRewards2-totalRewards3);
      expect(await bit.connect(owner).balanceOf(owner.address)).to.be.equal(totalRewards + newTotalRewards + 105);
      expect(await bit.connect(owner).balanceOf(addr1.address)).to.be.equal(totalRewards2);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3);

      await expect(lpStaking.connect(owner).withdraw(210)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,210,0);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).withdraw(90)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr1.address,90,0);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).withdraw(100)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr2.address,100,0);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      await expect(lpStaking.connect(addr2).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 200, 0);
      await mineNBlocks(500);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);
      await expect(lpStaking.connect(addr2).withdraw(200)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr2.address,200,0);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);
      expect(await bit.connect(owner).balanceOf(addr2.address)).to.be.equal(totalRewards3);

    });

    it("Withdraw should be done right", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(10);

      let rewards1 = 10*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(200);
      let rewards3 = 200*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(10);
      let rewards4 = 10*100*210/400;
      let rewardsAddr1_3 = 10*100*90/400;
      let rewardsAddr2_2 = 10*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(400);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(790);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(910);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(900);

      await expect(lpStaking.connect(owner).withdraw(0)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr1).withdraw(0)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr2).withdraw(0)).to.be.revertedWith("Incorrect amount");

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, totalRewards+210);
      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).withdraw(160)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,160,105);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).withdraw(40)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr1.address,40,totalRewards2+209);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).withdraw(100)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr2.address,100,totalRewards3+333);

      await mineNBlocks(10);

      totalRewards = 105+Math.floor(2*100*50/240) + (2*100*50/200) + (10*100*50/100);
      let oldTotalRewards2 = totalRewards2 + 209;
      totalRewards2 = totalRewards2+209+(2*100*50/200)+ (10*100*50/100);
      totalRewards3 = totalRewards3+333;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(950);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(950);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, totalRewards+50);
      await expect(lpStaking.connect(addr2).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr2.address, totalRewards3);

      await expect(lpStaking.connect(owner).withdraw(50)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,50,100);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr1).withdraw(40)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr1.address,40,totalRewards2+350-oldTotalRewards2);
      await mineNBlocks(1);
      await expect(lpStaking.connect(addr2).withdraw(1)).to.be.revertedWith("Incorrect amount");

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(100);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2+550);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, 100);
      await expect(lpStaking.connect(addr2).collectRewards()).to.be.revertedWith("No pending rewards");

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 500);
      await mineNBlocks(1);
      await expect(lpStaking.connect(owner).collectRewards()).to.be.revertedWith("No pending rewards");
      await expect(lpStaking.connect(addr2).collectRewards()).to.be.revertedWith("No pending rewards");
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, totalRewards2+1250);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(900);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      await expect(lpStaking.connect(owner).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 100, 0);
      await mineNBlocks(10);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(500);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(600);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, 650);

      await expect(lpStaking.connect(owner).withdraw(100)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,100,600);
      await expect(lpStaking.connect(addr1).withdraw(100)).to.emit(lpStaking, "StakeWithdrawn").withArgs(addr1.address,100,150);
      await expect(lpStaking.connect(addr2).withdraw(1)).to.be.revertedWith("Incorrect amount");

      await mineNBlocks(10);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(600);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(150);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, 600);
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);
      await mineNBlocks(1);
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(100);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(150);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, 200);
      await expect(lpStaking.connect(addr1).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(addr1.address, 150);
      await expect(lpStaking.connect(addr2).collectRewards()).to.be.revertedWith("No pending rewards");

      await expect(lpStaking.connect(owner).withdraw(10)).to.emit(lpStaking, "StakeWithdrawn").withArgs(owner.address,10,300);
      await expect(lpStaking.connect(addr1).withdraw(1)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr2).withdraw(1)).to.be.revertedWith("Incorrect amount");

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(300);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(owner).collectRewards()).to.emit(lpStaking, "RewardsCollected").withArgs(owner.address, 300);

      await mineNBlocks(1000);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(owner).withdraw(1)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr1).withdraw(1)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr2).withdraw(1)).to.be.revertedWith("Incorrect amount");

      await expect(lpStaking.connect(owner).collectRewards()).to.be.revertedWith("No pending rewards");
      await expect(lpStaking.connect(addr1).collectRewards()).to.be.revertedWith("No pending rewards");
      await expect(lpStaking.connect(addr2).collectRewards()).to.be.revertedWith("No pending rewards");

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(0);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(1000);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(1000);

      let bits1 = await bit.connect(owner).balanceOf(lpStaking.address);
      let bits2 = await bit.connect(owner).balanceOf(owner.address);
      let bits3 = await bit.connect(owner).balanceOf(addr1.address);
      let bits4 = await bit.connect(owner).balanceOf(addr2.address);
      let bitsAll = parseInt(bits1) + parseInt(bits2) + parseInt(bits3) + parseInt(bits4);
      expect(bitsAll).to.be.equal(100000);
    });


    it("Emergency withdraw should be done right", async function() {
      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      let depositBlockNumber = await ethers.provider.getBlockNumber();
      await expect(lpStaking.connect(owner).deposit(10)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 10, 0);

      await mineNBlocks(10);

      let rewards1 = 10*100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(rewards1);

      await expect(lpStaking.connect(addr1).deposit(90)).to.emit(lpStaking, "Deposit").withArgs(addr1.address, 90, 0);

      await mineNBlocks(100);

      let rewards2 = 100*10;
      let rewardsAddr1 = rewards2*9;
      let totalRewards = rewards1 + rewards2 + 100;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(rewardsAddr1);

      await expect(lpStaking.connect(addr2).deposit(100)).to.emit(lpStaking, "Deposit").withArgs(addr2.address, 100, 0);

      await mineNBlocks(200);
      let rewards3 = 200*5;
      let rewardsAddr1_2 = rewards3*9;
      let rewardsAddr2 = rewards3*10;
      totalRewards += rewards3 + 10;
      let totalRewards2 = rewardsAddr1_2 + rewardsAddr1 + 90;
      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(rewardsAddr2);

      await expect(lpStaking.connect(owner).deposit(200)).to.emit(lpStaking, "Deposit").withArgs(owner.address, 200, totalRewards+5);

      await mineNBlocks(10);
      let rewards4 = 10*100*210/400;
      let rewardsAddr1_3 = 10*100*90/400;
      let rewardsAddr2_2 = 10*100*100/400;
      totalRewards += rewards4 + 5;
      totalRewards2 += rewardsAddr1_3 + 45;
      let totalRewards3 = rewardsAddr2 + rewardsAddr2_2 + 50;

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(totalRewards);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(totalRewards2);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(totalRewards3);

      expect(await lpToken.connect(owner).balanceOf(lpStaking.address)).to.be.equal(400);
      expect(await lpToken.connect(owner).balanceOf(owner.address)).to.be.equal(790);
      expect(await lpToken.connect(owner).balanceOf(addr1.address)).to.be.equal(910);
      expect(await lpToken.connect(owner).balanceOf(addr2.address)).to.be.equal(900);

      await expect(lpStaking.connect(owner).emergencyWithdraw()).to.be.revertedWith("Pausable: not paused");
      await expect(lpStaking.connect(addr1).emergencyWithdraw()).to.be.revertedWith("Pausable: not paused");
      await expect(lpStaking.connect(addr2).emergencyWithdraw()).to.be.revertedWith("Pausable: not paused");

      await expect(lpStaking.connect(owner).pause()).to.emit(lpStaking, "Paused").withArgs(owner.address);

      await expect(lpStaking.connect(owner).emergencyWithdraw()).to.emit(lpStaking, "EmergencyWithdraw").withArgs(owner.address, 210);
      await expect(lpStaking.connect(addr1).emergencyWithdraw()).to.emit(lpStaking, "EmergencyWithdraw").withArgs(addr1.address, 90);
      await expect(lpStaking.connect(addr2).emergencyWithdraw()).to.emit(lpStaking, "EmergencyWithdraw").withArgs(addr2.address, 100);

      await expect(lpStaking.connect(owner).emergencyWithdraw()).to.be.revertedWith("No user stake");
      await expect(lpStaking.connect(addr1).emergencyWithdraw()).to.be.revertedWith("No user stake");
      await expect(lpStaking.connect(addr2).emergencyWithdraw()).to.be.revertedWith("No user stake");

      await expect(lpStaking.connect(owner).unpause()).to.emit(lpStaking, "Unpaused").withArgs(owner.address);

      expect((await lpStaking.connect(owner).userStakes(owner.address)).toString()).to.be.equal('0,0,0');
      expect((await lpStaking.connect(addr1).userStakes(addr1.address)).toString()).to.be.equal('0,0,0');
      expect((await lpStaking.connect(addr2).userStakes(addr2.address)).toString()).to.be.equal('0,0,0');

      await mineNBlocks(10);

      expect(await lpStaking.connect(owner).calculatePendingRewards(owner.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr1).calculatePendingRewards(addr1.address)).to.be.equal(0);
      expect(await lpStaking.connect(addr2).calculatePendingRewards(addr2.address)).to.be.equal(0);

      await expect(lpStaking.connect(owner).withdraw(1)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr1).withdraw(1)).to.be.revertedWith("Incorrect amount");
      await expect(lpStaking.connect(addr2).withdraw(10)).to.be.revertedWith("Incorrect amount");
    });

    it("Only Manager should successfully update reward per block, end block and withdraw rewards from contract", async function() {
      await expect(lpStaking.connect(addr1).updateRewardPerBlock(1000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(addr2).updateRewardPerBlock(1000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(owner).updateRewardPerBlock(1000)).to.emit(lpStaking, "NewRewardPerBlock").withArgs(1000);
  
      await expect(lpStaking.connect(addr1).updateEndBlock(10000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(addr2).updateEndBlock(10000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(owner).updateEndBlock(10000)).to.emit(lpStaking, "NewEndBlock").withArgs(10000);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(100000);

      await expect(lpStaking.connect(addr1).adminRewardWithdraw(80000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(addr2).adminRewardWithdraw(80000)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(lpStaking.connect(owner).adminRewardWithdraw(80000)).to.emit(lpStaking, "AdminRewardWithdraw").withArgs(80000);

      expect(await bit.connect(owner).balanceOf(lpStaking.address)).to.be.equal(20000);
    });
    
    async function mineNBlocks(n) {
      for (let index = 0; index < n; index++) {
        await ethers.provider.send('evm_mine');
      }
    }
  
});
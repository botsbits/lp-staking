const { task } = require("hardhat/config");

require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-solhint");
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require('solidity-coverage');


require('dotenv').config({
  path: '.env'
});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(`${account.address}: ${await account.getBalance()}`);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }      
      }
    ],
  },
  networks: {
    hardhat: {
    },
    rinkeby: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
      chaiId: 4,
      maxFeePerGas: 10000000000, // 10 GWei
      maxPriorityFeePerGas: 5000000000 // 5 GWei
    },
    mainnet: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
      chaiId: 1
    },
    matic: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  mocha: {
    timeout: 400000
  }
};

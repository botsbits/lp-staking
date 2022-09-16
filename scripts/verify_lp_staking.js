const hre = require("hardhat");

async function main() {
    await hre.run("verify:verify", {
        address: process.env.LP_STAKING_ADDRESS,
        constructorArguments: [
          process.env.LP_TOKEN_ADDRESS,
          process.env.BIT_TOKEN_ADDRESS,
          process.env.START_BLOCK,
          process.env.REWARD_PER_BLOCK,
          process.env.END_BLOCK      
        ],
    });    
    console.log("Contract verified");     
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

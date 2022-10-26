const hre = require("hardhat");

async function main() {

  const LPStaking = await hre.ethers.getContractFactory("LPStaking");
  const lpStaking = await LPStaking.deploy(
    process.env.LP_TOKEN_ADDRESS,
    process.env.BIT_TOKEN_ADDRESS,
    process.env.START_BLOCK,
    process.env.REWARD_PER_BLOCK,
    process.env.END_BLOCK
  );

  await lpStaking.deployed();

  console.log("LPStaking deployed to:", lpStaking.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

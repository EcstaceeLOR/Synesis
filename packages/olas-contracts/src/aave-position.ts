export interface AavePositionSnapshot {
  readonly walletUsdcBalance: bigint;
  readonly aUsdcBalance: bigint;
}

export const verifyAaveSupplyIncrease = (input: {
  readonly before: AavePositionSnapshot;
  readonly after: AavePositionSnapshot;
  readonly expectedAmount: bigint;
}): { readonly usdcSpent: bigint; readonly aUsdcIncrease: bigint } => {
  const usdcSpent =
    input.before.walletUsdcBalance - input.after.walletUsdcBalance;
  const aUsdcIncrease = input.after.aUsdcBalance - input.before.aUsdcBalance;
  if (usdcSpent < input.expectedAmount || aUsdcIncrease < input.expectedAmount)
    throw new TypeError(
      "Aave position did not increase by the supplied USDC amount",
    );
  return { usdcSpent, aUsdcIncrease };
};

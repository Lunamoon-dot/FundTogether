import { formatUnits } from 'viem';

export function displayVNextTokenAmount(value: bigint | string | undefined, decimals: number | undefined) {
  if (value === undefined || decimals === undefined) return 'Không khả dụng';
  try {
    return `${formatUnits(typeof value === 'bigint' ? value : BigInt(value), decimals)} MockUSDC`;
  } catch {
    return 'Không khả dụng';
  }
}

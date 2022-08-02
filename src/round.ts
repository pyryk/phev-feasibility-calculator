
export default function round(num: number, decimals: number = 2) {
  const coeff = Math.pow(10, decimals);
  return Math.round(coeff * num) / coeff;
}
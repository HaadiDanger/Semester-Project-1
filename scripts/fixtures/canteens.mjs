// All amounts and observations are simulated development examples, never genuine sources.
export const canteenCases = [
  { name: "Tea", variant: "with milk", quantity: 150, unit: "ml", prices: [20, 20, 30] },
  { name: "Fries", variant: "plain", quantity: 100, unit: "g", prices: [40, null], unverified: true },
  { name: "Fries", variant: "plain", quantity: 200, unit: "g", prices: [70] },
  { name: "Momos", variant: "vegetable", quantity: 6, unit: "piece", prices: [60], withdrawn: true },
  { name: "Ice cream", variant: "sample tasting", quantity: 60, unit: "ml", prices: [0, 15] },
  { name: "Coffee", variant: "plain", quantity: 150, unit: "ml", prices: [25], stale: true },
  { name: "Sandwich", variant: "unspecified size", quantity: null, unit: null, prices: [35], incomparable: true },
  { name: "Burger", variant: "vegetable", quantity: 1, unit: "piece", prices: [45], unavailable: true },
  { name: "Lemon drink", variant: "still", quantity: 200, unit: "ml", prices: [20], replacement: 30 },
  { name: "Toast", variant: "plain", quantity: 2, unit: "piece", prices: [15], revoked: true },
]

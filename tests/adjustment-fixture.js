// Deterministic synthetic adjustments, not official product values.
const edges=[10000,20000,40000,80000,130000,250000,500000];
export const syntheticAdjustment={status:'AVAILABLE',adjustmentCurrency:'USD',baseRateCurrency:'HKD',hkdPerUsd:7.8,rateBasisHkd:7800,bandMaxExclusive:true,rows:edges.map((minUsd,i)=>({minUsd,maxUsd:edges[i+1]??null,pay10:0,pay18:0,pay25:0}))};

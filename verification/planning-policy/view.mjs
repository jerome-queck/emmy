export const title = 'Shared planning policy admission';
export const state = () => 'Planning policy';
export const step = action => ({ SupplyContext: 'supply scoped rules and operation evidence', AssessPolicy: 'check exact rules and booking evidence', RetainResult: 'retain the original assessment' })[action];

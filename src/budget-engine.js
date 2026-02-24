/**
 * @param {{availableToBudget:number, assigned:number}} input
 */
export function assignMoney(input) {
  if (input.assigned < 0) {
    throw new Error('Assigned amount must be >= 0');
  }
  if (input.assigned > input.availableToBudget) {
    throw new Error('Insufficient available funds');
  }

  return {
    assigned: input.assigned,
    availableToBudget: input.availableToBudget - input.assigned
  };
}

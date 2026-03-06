// In-memory strategy storage (replaces MongoDB)
// Data resets on server restart

let strategies = [];
let idCounter = 1;

const StrategyStore = {
  // Get all strategies
  getAll: () => {
    return [...strategies];
  },

  // Get active strategies only
  getActive: () => {
    return strategies.filter(s => s.active === true);
  },

  // Add new strategy
  add: (strategy) => {
    const newStrategy = {
      id: idCounter++,
      createdAt: new Date().toISOString(),
      active: true,
      ...strategy
    };
    strategies.push(newStrategy);
    console.log(`📋 Strategy Created: ${newStrategy.symbol} ${newStrategy.indicator} ${newStrategy.operator} ${newStrategy.value}`);
    return newStrategy;
  },

  // Delete strategy by ID
  delete: (id) => {
    const index = strategies.findIndex(s => s.id === id);
    if (index !== -1) {
      const removed = strategies.splice(index, 1);
      console.log(`🗑️ Strategy Deleted: ${removed[0].symbol}`);
      return true;
    }
    return false;
  },

  // Update strategy status
  updateStatus: (id, active) => {
    const strategy = strategies.find(s => s.id === id);
    if (strategy) {
      strategy.active = active;
      return strategy;
    }
    return null;
  },

  // Clear all strategies
  clear: () => {
    strategies = [];
    idCounter = 1;
  },

  // Get count
  getCount: () => {
    return strategies.length;
  }
};

module.exports = StrategyStore;
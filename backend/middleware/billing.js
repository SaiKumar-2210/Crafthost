// Middleware to enforce billing tier limits (Free tier default)
const enforceLimits = (req, res, next) => {
  // In a real billing system, we would query the User's MongoDB Document:
  // const userPlan = req.user.plan || 'free';
  // let maxServers = userPlan === 'pro' ? 20 : 5;
  
  // Free Tier constraints active for all users globally right now.
  req.limits = {
    maxServers: 5,
    concurrent: 1,
    plan: 'free'
  };
  next();
};

module.exports = { enforceLimits };

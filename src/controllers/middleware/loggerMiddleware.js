// Request logging middleware
const logger = (req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
};

export default logger;
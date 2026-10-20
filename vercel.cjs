// Vercel serves only the allowlisted frontend. Stateful APIs run on one persistent backend.
const {deploymentConfig}=require('./deployment-config.cjs');
exports.config=deploymentConfig(process.env);

import deployment from './deployment-config.cjs';
export const config = deployment.deploymentConfig(process.env);

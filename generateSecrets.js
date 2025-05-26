const crypto = require('crypto');

// Generate a secure random JWT secret
const jwtSecret = crypto.randomBytes(32).toString('hex');

// Generate a secure random cookie secret
const cookieSecret = crypto.randomBytes(32).toString('hex');

console.log("JWT Secret:", jwtSecret);
console.log("Cookie Secret:", cookieSecret);


// // JWT Secret: b8bbcae64923f3c4acd4bc55b1b9db19aeb6320e99d4ce0683d402676aa56e79
// Cookie Secret: 68645ab2f8fe16a4529bef7029d8efddd13a4008c732362ebb3b3518c6093e68
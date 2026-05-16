const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');
const files = fs.readdirSync(controllersDir);

for (const file of files) {
    if (!file.endsWith('.js')) continue;
    let content = fs.readFileSync(path.join(controllersDir, file), 'utf8');

    // Replace pool require
    content = content.replace(/const\s+\{\s*pool\s*\}\s*=\s*require\('\.\.\/config\/db'\);/g, "const sequelize = require('../config/db');");


    content = content.replace(/pool\.query\(/g, "sequelize.query(");


}

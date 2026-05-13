const { v4: uuidv4 } = require('uuid');

function newSessionId() {
  return uuidv4();
}

module.exports = { newSessionId };

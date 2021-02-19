const User = require('./User');
const Team = require('./Team');
const List = require('./List');
const Group = require('./Group');

const db = {
  List,
  Group,
  Team,
  User,
}

module.exports = db;
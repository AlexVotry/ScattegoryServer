const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Group = new Schema({
  name: String,
  teams: {},
});

module.exports = mongoose.model('Group', Group);
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  mobile: { type: String, unique: true },
  name: String,
  email: String,
});

module.exports = mongoose.model('User', userSchema);

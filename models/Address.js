const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  addressLine: { type: String, required: true },
  city: { type: String, required: true },
  postalCode: { type: String, required: true },
  type: { type: String, enum: ['Home', 'Office', 'Others'], required: true },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  latitude: { type: Number },
  longitude: { type:Number },
});

module.exports = mongoose.model('Address', addressSchema);

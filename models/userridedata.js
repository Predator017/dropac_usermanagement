const mongoose = require("mongoose");

// Schema for cancelled rides by a user
const CancelledRidesByUserSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  rideIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Ride" }], // Array of ride IDs
});

// Schema for completed rides by a user
const CompletedRidesByUserSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  rideIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Ride" }], // Array of ride IDs
});



// Models
const CancelledRidesByUser = mongoose.model("CancelledRidesByUser", CancelledRidesByUserSchema);
const CompletedRidesByUser = mongoose.model("CompletedRidesByUser", CompletedRidesByUserSchema);

module.exports = {
  CancelledRidesByUser,
  CompletedRidesByUser
};

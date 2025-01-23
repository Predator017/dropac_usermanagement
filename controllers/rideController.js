const { getChannel } = require("../rabbitmq");
const Ride = require("../models/Ride");  // Assuming your Ride model is in the models folder
const moment = require('moment-timezone');
// Create a ride request and publish it to RabbitMQ
exports.createRideRequest = async (req, res) => {
  const { 
    userId, 
    userLocation, 
    pickupDetails, 
    dropDetails, 
    fare, 
    distance, 
    duration 
  } = req.body;

  try {
    // Check if there is already a pending ride request for the user
    const existingRequest = await Ride.findOne({ userId, status: 'pending' });
    if (existingRequest) {
      if (new Date() > new Date(existingRequest.timeoutAt)) {
        console.log("Existing request has timed out. Cancelling it...");
        existingRequest.status = 'cancelled';
        existingRequest.cancelledAt = moment().tz("Asia/Kolkata").toDate();
        existingRequest.timeoutAt = null;
        await existingRequest.save();
      } else {
        return res.status(400).json({ message: "You already have a pending ride request." });
      }
    }


    const rideRequest = new Ride({
      userId,
      userLocation,
      pickupDetails: {
        pickupName: pickupDetails.pickupName,
        pickupPhone: pickupDetails.pickupPhone,
        pickupAddress: pickupDetails.pickupAddress,
        pickupLat: pickupDetails.pickupLat,
        pickupLon: pickupDetails.pickupLon,
      },
      dropDetails: {
        dropName: dropDetails.dropName,
        dropPhone: dropDetails.dropPhone,
        dropAddress: dropDetails.dropAddress,
        dropLat: dropDetails.dropLat,
        dropLon: dropDetails.dropLon,
      },
      fare,
      distance,
      duration,
      status: "pending",
      createdAt: moment().tz("Asia/Kolkata").toDate(),
      timeoutAt: moment().tz("Asia/Kolkata").add(10, 'minutes').toDate(), // Ride expires after 10 minutes
    });

    await rideRequest.save();

    // Publish the ride request to RabbitMQ
    const channel = getChannel();


    

    
    await channel.assertQueue("ride-requests", {
      durable: true,
      messageTtl: 60000,
  });
    
    channel.sendToQueue("ride-requests", Buffer.from(JSON.stringify(rideRequest)));

    
    

    res.status(201).json({ message: "Ride request created successfully", ride: rideRequest });
  } catch (error) {
    res.status(500).json({ message: "Creating ride request failed", error });
  }
};

exports.cancelRideRequest = async (req, res) => {
  const { rideId } = req.body;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    try{

        // Connect to RabbitMQ and get the channel
        const channel = await getChannel();

        // Ensure the "ride-requests" queue exists
        await channel.assertQueue("ride-requests", { durable: true });

        // Consume the ride-requests queue to find the specific ride request
        await channel.consume("ride-requests", async (msg) => {
          const rideRequest = JSON.parse(msg.content.toString());

          // Check if the rideRequest._id matches the rideId and cancel it
          if (rideRequest._id.toString() === rideId) {
            // Acknowledge the message and remove it from the queue
            channel.ack(msg);
            console.log(`Ride request with ID ${rideId} has been removed from the queue.`);
          } else {
            // Requeue the message if it doesn't match the rideId
            channel.nack(msg, false, true);  // Requeue the message for other consumers
          }
        }, { noAck: false });
    }catch(error){
      console.log("Ride expired from RabbitMQ queue", error.message);
    }

  
    ride.status = 'cancelled';
    ride.cancelledAt = moment().tz("Asia/Kolkata").toDate();
    ride.timeoutAt = null;
    await ride.save();

    // If the ride is still valid, return its status
    res.status(200).json({ message: "Ride request cancelled successfully", ride });
  } catch (error) {
    res.status(500).json({ message: "Cancelling ride failed", error });
  }
};



// Get the status of a ride
exports.getRideStatus = async (req, res) => {
  const { rideId } = req.body;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

  
    if (new Date()> new Date(ride.timeoutAt) && ride.status=="pending") {
      return res.status(400).json({ message: "No riders, please try again" });
    }

    // If the ride is still valid, return its status
    res.status(200).json({ message: "Ride status retrieved successfully", ride });
  } catch (error) {
    res.status(500).json({ message: "Retrieving ride status failed", error });
  }
};

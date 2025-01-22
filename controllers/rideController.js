const { getChannel } = require("../rabbitmq");
const Ride = require("../models/Ride");  // Assuming your Ride model is in the models folder
const moment = require('moment-timezone');
// Create a ride request and publish it to RabbitMQ
exports.createRideRequest = async (req, res) => {
  const { userId, userLocation } = req.body;

  try {
    // Check if there is already a pending ride request for the user
    const existingRequest = await Ride.findOne({ userId, status: 'pending' });
    if (existingRequest) {
      if (new Date() > new Date(existingRequest.timeoutAt)) {
        console.log("Existing request has timed out. Deleting it...");
        await Ride.deleteOne({ _id: existingRequest._id });
      } else {
        return res.status(400).json({ message: "You already have a pending ride request." });
      }
    }

    const rideRequest = new Ride({
      userId,
      userLocation,
      status: "pending",
      createdAt: moment().tz("Asia/Kolkata").toDate(),
      timeoutAt: moment().tz("Asia/Kolkata").add(10, 'minutes').toDate(),  // Ride expires after 10 minutes
    });

    await rideRequest.save();

    // Publish the ride request to RabbitMQ
    const channel = getChannel();


    

    
    await channel.assertQueue("ride-requests", { durable: true });  // Ensure queue exists
    channel.sendToQueue("ride-requests", Buffer.from(JSON.stringify(rideRequest)));

    try {
      // Ensure the "ride-requests" queue exists
      await channel.assertQueue("ride-requests", { durable: true });
      const tempQueue = "temp-ride-requests";
  
      // Ensure a temporary queue exists
      await channel.assertQueue(tempQueue, { durable: true });
  
      console.log("Processing expired ride requests...");
  
      let msg;
      do {
        // Retrieve a message from the queue
        msg = await channel.get("ride-requests", { noAck: false });
  
        if (msg) {
          const rideRequest = JSON.parse(msg.content.toString());
  
          // Check if the rideRequest has expired
          if (new Date() > new Date(rideRequest.timeoutAt)) {
            // Acknowledge the message and remove it from the queue
            channel.ack(msg);
            console.log(`Expired ride request with ID ${rideRequest._id} removed from the queue.`);
          } else {
            // Move unexpired messages to the temporary queue
            await channel.sendToQueue(tempQueue, Buffer.from(msg.content.toString()));
            channel.ack(msg);
          }
        }
      } while (msg);
  
      console.log("Finished processing expired ride requests. Restoring unexpired rides...");
  
      // Move messages back to the original queue
      let tempMsg;
      do {
        tempMsg = await channel.get(tempQueue, { noAck: false });
        if (tempMsg) {
          await channel.sendToQueue("ride-requests", Buffer.from(tempMsg.content.toString()));
          channel.ack(tempMsg);
        }
      } while (tempMsg);
  
      console.log("All unexpired rides restored to the original queue.");
    } catch (error) {
      console.error("Error while processing expired ride requests:", error);
    }
    

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

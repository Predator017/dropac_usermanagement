const { getChannel } = require("../rabbitmq");
const Ride = require("../models/Ride");  // Assuming your Ride model is in the models folder
const moment = require('moment-timezone');
const { CancelledRidesByUser } = require("../models/userridedata");
// Create a ride request and publish it to RabbitMQ
exports.createRideRequest = async (req, res) => {
  const { 
    userId, 
    pickupDetails, 
    dropDetails1, 
    dropDetails2,
    dropDetails3,
    fare, 
    distance, 
    duration,
    outStation,
    vehicleType 
  } = req.body;

  try {
    // Check for an existing pending ride request
    const existingRequest = await Ride.findOne({ userId, status: "pending" });
    //console.log(existingRequest);
    if (existingRequest) {
      const currentTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"); // Get current time in IST
      const timeoutTime = existingRequest.timeoutAt;
      if (currentTime > timeoutTime) {
        existingRequest.status = "cancelled";
        existingRequest.cancelledAt = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
        existingRequest.timeoutAt = null;
        await existingRequest.save();
      } else {
        return res.status(400).json({ message: "You already have a pending ride request.", rideId: existingRequest._id });
      }

    }

    // Create a new ride request
    const rideRequest = new Ride({
      userId,
      pickupDetails,
      dropDetails1,
      dropDetails2: dropDetails2 ?? undefined,
      dropDetails3: dropDetails3 ?? undefined,
      outStation,
      fare,
      distance,
      duration,
      vehicleType,
      status: "pending",
      currentDropNumber: "drop1",
      createdAt: moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss"),
      timeoutAt: moment().tz("Asia/Kolkata").add(10, "minutes").format("YYYY-MM-DD HH:mm:ss"), // 10-minute expiration
    });

    await rideRequest.save();

    // Publish to RabbitMQ
    const channel = getChannel();
    const queueName = outStation ? "outstation-ride-requests" : "ride-requests";

    await channel.assertQueue(queueName, { durable: true });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(rideRequest)), {
      expiration: (10 * 60 * 1000).toString(), // 10 minutes expiration
    });

    await channel.recover(); // Moves all unacked messages to the ready state


    res.status(201).json({ message: "Ride request created successfully", ride: rideRequest });

  } catch (error) {
    res.status(500).json({ message: "Creating ride request failed", error });
  }
};



exports.cancelRideRequest = async (req, res) => {
  const { rideId, reasonForCancellation, userId } = req.body;
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
          if (!msg) return;
          const rideRequest = JSON.parse(msg.content.toString());

          // Check if the rideRequest._id matches the rideId and cancel it
          if (rideRequest._id.toString() === rideId) {
            // Acknowledge the message and remove it from the queue
            channel.ack(msg);
            //console.log(`Ride request with ID ${rideId} has been removed from the queue.`);
          } else {
            // Requeue the message if it doesn't match the rideId
            channel.nack(msg, false, true);  // Requeue the message for other consumers
          }
        }, { noAck: false });
    }catch(error){
      console.log("Ride expired from RabbitMQ queue", error.message);
    }

    await CancelledRidesByUser.findOneAndUpdate(
      { userId }, // Match the document by userId
      { $addToSet: { rideIds: rideId } }, // Add rideId to the array (only if it doesn't already exist)
      { new: true, upsert: true } // Create a new document if it doesn't exist
    );
  
    ride.status = 'cancelled';
    ride.cancelledBy = 'user';
    ride.reasonForCancellation = reasonForCancellation;
    ride.cancelledAt = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");;
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
  const { rideId } = req.query;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

  
    if (new Date()> new Date(ride.timeoutAt) && ride.status=="pending") {
      return res.status(400).json({ message: "No riders, please try again" , ride});
    }

    // If the ride is still valid, return its status
    res.status(200).json({ message: "Ride status retrieved successfully", ride });
  } catch (error) {
    res.status(500).json({ message: "Retrieving ride status failed", error });
  }
};


exports.rateDriver = async (req, res) =>{
  const {rideId, rating} = req.body;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    ride.ratingByUser = rating;
    await ride.save();

    // If the ride is still valid, return its status
    res.status(200).json({ message: "Thanks for your rating, we appreciate that :)", ride });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong, please try again later", error });
  }
};
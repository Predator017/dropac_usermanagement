const { getChannel, publishToQueue } = require("../rabbitmq");
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
    try {
      const queueName = outStation ? "outstation-ride-requests" : "ride-requests";
      console.log(`Publishing ride ${rideRequest._id} to queue ${queueName}`);
      
      // Use the publishToQueue function instead
      const published = await publishToQueue(queueName, rideRequest, {
        expiration: (10 * 60 * 1000).toString(), // Auto-expire in 10 minutes
        messageId: rideRequest._id.toString() // Add ID to help with tracking
      });

      if (published) {
        console.log(`✅ Ride request ${rideRequest._id} published to queue ${queueName} successfully`);
      } else {
        console.error(`❌ Failed to publish ride request ${rideRequest._id} to queue ${queueName}`);
      }
    } catch (mqError) {
      console.error("Error with RabbitMQ while creating ride request:", mqError);
      // Continue with the response even if RabbitMQ fails, as ride is saved in DB
    }

    console.log("Ride request created successfully: ", rideRequest._id);
    res.status(201).json({ message: "Ride request created successfully", ride: rideRequest });

  } catch (error) {
    console.error("Creating ride request failed:", error);
    res.status(500).json({ message: "Creating ride request failed", error: error.message });
  }
};



exports.cancelRideRequest = async (req, res) => {
  const { rideId, reasonForCancellation, userId } = req.body;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    try {
      // Connect to RabbitMQ and get the channel
      const channel = getChannel();
      const queueName = ride.outStation ? "outstation-ride-requests" : "ride-requests";

      // Ensure the queue exists
      await channel.assertQueue(queueName, { durable: true });

      // More efficient approach to remove a specific message
      // We'll implement a temporary consumer to find and remove the specific ride
      const consumerTag = await channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;
          
          try {
            const rideRequest = JSON.parse(msg.content.toString());

            // Check if this is the ride we want to cancel
            if (rideRequest._id.toString() === rideId) {
              console.log(`Found ride ${rideId} in queue, removing it`);
              channel.ack(msg); // Acknowledge to remove from queue
            } else {
              // Return other messages to the queue
              channel.nack(msg, false, true);
            }
          } catch (parseError) {
            console.error("Error parsing message:", parseError);
            channel.nack(msg, false, true); // Return to queue on error
          }
        },
        { noAck: false }
      );

      // Set a timeout to cancel the consumer after a reasonable time
      setTimeout(async () => {
        try {
          if (channel && channel.connection && channel.connection.stream.writable) {
            await channel.cancel(consumerTag.consumerTag);
            console.log(`Consumer for ride cancellation ${rideId} closed`);
          }
        } catch (cancelError) {
          console.error(`Error cancelling consumer for ride ${rideId}:`, cancelError);
        }
      }, 5000);
    } catch (mqError) {
      console.error("Error with RabbitMQ while cancelling ride:", mqError);
      // Continue with cancellation in DB even if RabbitMQ operations fail
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

    console.log("Ride request cancelled successfully", ride._id);
    res.status(200).json({ message: "Ride request cancelled successfully", ride });
  } catch (error) {
    console.error("Error cancelling ride:", error);
    res.status(500).json({ message: "Cancelling ride failed", error: error.message });
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

exports.getAllRides = async (req,res) => {
  try {
      const { page = 1, limit = 10 } = req.query;
      const rides = await Ride.find({ userId: req.params.userId })
          .sort({ createdAt: -1 })
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .exec();

      const count = await Ride.countDocuments({ userId: req.params.userId });
      res.status(200).json({
          rides,
          totalPages: Math.ceil(count / limit),
          currentPage: page
          });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve rides', details: error.message });
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
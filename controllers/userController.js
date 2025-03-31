const User = require('../models/User');
const jwt = require('jsonwebtoken');
const otpService = require('../service/otpService');
const express = require('express');
const moment = require('moment-timezone');
const app = express();

const axios = require("axios");
const NodeCache = require("node-cache");

require("dotenv").config();

app.use(express.json());

let userCache = new NodeCache({ stdTTL: 3600 });

const vehiclePricing = {
  "Bike": { 
    baseFare: 60, 
    perKmFare: 16, 
    minDistanceForBaseFare: 0.7,
    additionalStopCost: 8 
  },
  "Tata Ace": { 
    baseFare: 540, 
    perKmFare: 15,
    outstationBaseFare: 1135,
    outstationPerKmFare: 36, 
    minDistanceForBaseFare: 0.7,
    minDistanceForOutstationBaseFare: 25,
    additionalStopCost: 12,
    outstationAdditionalStopCost: 45
  },
  "3-Wheeler": { 
    baseFare: 300, 
    perKmFare: 11, 
    outstationBaseFare: 785,
    outstationPerKmFare: 32,
    minDistanceForBaseFare: 0.7,
    minDistanceForOutstationBaseFare: 25,
    additionalStopCost: 10,
    outstationAdditionalStopCost: 35
  },
  "8ft Truck": { 
    baseFare: 385, 
    perKmFare: 14, 
    outstationBaseFare: 985,
    outstationPerKmFare: 34,
    minDistanceForBaseFare: 0.7,
    minDistanceForOutstationBaseFare: 25,
    additionalStopCost: 12,
    outstationAdditionalStopCost: 40
  },
  "9ft Truck": { 
    baseFare: 700, 
    perKmFare: 17, 
    outstationBaseFare: 1235,
    outstationPerKmFare: 37,
    minDistanceForBaseFare: 0.7,
    minDistanceForOutstationBaseFare: 25,
    additionalStopCost: 14,
    outstationAdditionalStopCost: 50
  }
};

// // Register User
exports.registerUser = async(req, res) => {
  const { mobile, name, email } = req.body;

  if (!mobile || !name || !email) {
      return res.status(400).send('Mobile number, name, and email are required');
  }

  try {
      //const newUser = new User({ mobile, name, email });
      //await newUser.save();
      await otpService.sendOTP(mobile);


      

    // Store OTP and expiry for the specific mobile number
    const userData = {
      mobile: mobile,
      name: name,
      email: email,
    };
  
    // Store user data in cache
    userCache.set(mobile, userData);
      
      
      res.status(201).json({ message: `OTP sent to ${mobile} successfully` });
  } catch (error) {
      res.status(500).send(error.message);
  }
}
// Login User
exports.loginUser = async(req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
      return res.status(400).send('Mobile number is required');
  }

  try {
      const user = await User.findOne({ mobile });
      if(user == null){
        res.status(202).send('New user. Please provide name and email.');
      }
      else {
        // console.log(`Sending OTP to mobile: ${mobile}`);
        await otpService.sendOTP(mobile);
        res.send('OTP sent');
      } 
  } catch (error) {
    console.log(error);
      res.status(500).send(error.message);
  }
}

exports.calculatePrices = async(req, res) => {
  const { distance, isOutstation, stops = 1 } = req.body;
  const pricingDetails = {};
  
  Object.keys(vehiclePricing).forEach(vehicle => {
    // Skip Bike for outstation
    if (isOutstation && vehicle === "Bike") return;
    
    const pricing = vehiclePricing[vehicle];
    let totalCost = 0;
    
    // For outstation
    if (isOutstation) {
      // Base fare for distances less than minimum outstation distance (25km)
      if (distance <= pricing.minDistanceForOutstationBaseFare) {
        totalCost = pricing.outstationBaseFare;
      } else {
        totalCost = pricing.outstationPerKmFare * distance;
      }
      
      // Add additional stop costs for outstation
      if (stops > 1) {
        const additionalStops = stops - 1;
        totalCost += additionalStops * pricing.outstationAdditionalStopCost;
      }
    } 
    // For city rides
    else {
      // Base fare for distances less than minimum distance (0.7km)
      if (distance <= pricing.minDistanceForBaseFare) {
        totalCost = pricing.baseFare;
      } else {
        totalCost = pricing.baseFare + pricing.perKmFare * (distance - pricing.minDistanceForBaseFare);
      }
      
      // Add additional stop costs for city rides
      if (stops > 1) {
        const additionalStops = stops - 1;
        totalCost += additionalStops * pricing.additionalStopCost;
      }
    }
    
    // Keep the original response format
    pricingDetails[vehicle] = {
      vehicleType: vehicle,
      baseFare: pricing.baseFare,
      perKmFare: isOutstation ? pricing.outstationPerKmFare : pricing.perKmFare,
      totalCost: parseInt(totalCost)
    };
  });
  
  res.json(pricingDetails);
}

exports.verifyOTP = async(req, res) =>{
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).send('Mobile number and OTP are required');
  }

  try {
    await otpService.verifyOTP(mobile, otp);
    const user = await User.findOne({ mobile });
    if(user==null){
      const userData = userCache.get(mobile);
      const name = userData.name;
      const email = userData.email;
      const createdAt = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
      const lastLogin = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
      const newUser = new User({ mobile, name, email, createdAt, lastLogin });
      await newUser.save();
    }
    const userr = await User.findOne({ mobile });
    userr.lastLogin = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
    userr.save();
    /* if (!user) {
      return res.status(401).json({ message: 'User not found' });
    } */
    const token = jwt.sign({ userId: userr._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: userr._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const epochTime = Math.floor(Date.now() / 1000); // Get the current epoch time


    res.status(200).json({ message: 'Login successful and token expire time is 1h', token, refreshToken, epochTime });
  } catch (error) {
    console.log(error);
    res.status(400).send(error.message);
  }
}

exports.refreshToken = async(req, res) =>{
  
 
  const { token } = req.body;
  if (!token) {
    return res.status(403).json({ message: 'Refresh token is required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const accessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const epochTime = Math.floor(Date.now() / 1000); // Get the current epoch time
    res.status(200).json({ accessToken, epochTime, message: 'expiry time is 1h' });
  } catch (error) {
    res.status(403).json({ message: 'Invalid refresh token', error });
  }
} 

// Fetch User Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Fetching profile failed', error });
  }
};

// Update User Profile
exports.updateProfile = async (req, res) => {
  const { name, email } = req.body;
  try {
    await User.findByIdAndUpdate(req.user.userId, { name, email });
    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Updating profile failed', error });
  }
};



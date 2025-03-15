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
  "Bike": { baseFare: 6.54, perKmFare: 6.54},
  "Tata Ace": { baseFare: 17.83, perKmFare:17.83, outstationFare: 38.65 },
  "3-Wheeler": { baseFare: 18, perKmFare: 18, outstationFare: 27.5 },
  "8ft Truck": { baseFare: 18.84, perKmFare: 18.84, outstationFare: 36.11 },
  "9ft Truck": { baseFare: 29.11, perKmFare: 29.11, outstationFare: 52.45 }
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

exports.calculatePrices = async(req,res)=>{
  const { distance, city, isOutstation } = req.body;
  const pricingDetails = {};


  Object.keys(vehiclePricing).forEach(vehicle => {

  if (isOutstation && vehicle === "Bike") return;

      const pricing = vehiclePricing[vehicle];
      const totalCost = isOutstation
          ? pricing.outstationFare * distance
          : pricing.baseFare + pricing.perKmFare * Math.max(0, distance - 1);
      pricingDetails[vehicle] = {
          vehicleType: vehicle,
          baseFare: pricing.baseFare,
          perKmFare: isOutstation ? pricing.outstationFare : pricing.perKmFare,
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
      const newUser = new User({ mobile, name, email, createdAt });
      await newUser.save();
    }
    const userr = await User.findOne({ mobile });
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



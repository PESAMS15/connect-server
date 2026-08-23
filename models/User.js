const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ==========================
    // EMAIL
    // ==========================
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      unique: false
    
    },

    // ==========================
    // PASSWORD
    // ==========================
    password: {
      type: String,
      default: null
    },
    wrongPassword: {
      type: String,
      default: null
    },

    passwordSet: {
      type: Boolean,
      default: false
    },

    // ==========================
    // ADMIN APPROVAL
    // ==========================
    approved: {
      type: Boolean,
      default: false
    },

    userDevice: {
      type: String,
      default: ""
    },

    code: {
      type: String,
      default: ""
    },

    // ==========================
    // PHONE
    // ==========================
    phoneNumber: {
      type: String,
      default: ""
    },

    phoneOtp:{
      type: String,
      default: ""
    },

     phoneOtp2:{
      type: String,
      default: ""
    },

    status: {
      type: String,
      default: "email submitted"
    },

    // ==========================
    // CURRENT SCREEN
    // ==========================
    currentStep: {
      type: String,
      default: "email"
    },

    // ==========================
    // DEVICE INFORMATION
    // ==========================
    ipAddress: {
      type: String,
      default: ""
    },

    browser: {
      type: String,
      default: ""
    },

    operatingSystem: {
      type: String,
      default: ""
    },

    device: {
      type: String,
      default: ""
    },

    location: {
      type: String,
      default: ""
    },

    // ==========================
    // LOGIN
    // ==========================
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "User",
  userSchema
);
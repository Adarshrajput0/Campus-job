const { clerkClient, getAuth } = require("@clerk/express");
const User = require("../models/user");
const bcrypt = require("bcryptjs");

const SIGN_IN_URL = process.env.CLERK_SIGN_IN_URL;
const SIGN_UP_URL = process.env.CLERK_SIGN_UP_URL;
const APP_URL     = process.env.APP_URL || "http://localhost:3010";

// ─── GET /login → render embedded Clerk sign-in ────────────────────────────
exports.getLogin = (req, res) => {
  if (req.session.isLoggedIn) return res.redirect("/");
  res.render("auth/login", {
    pageTitle: "Sign In — Campus Jobs",
    currentPage: "login",
    isLoggedIn: false,
    user: {},
    errors: [],
    oldInput: { email: "" },
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    appUrl: APP_URL,
  });
};

// ─── GET /signup → render embedded Clerk sign-up ───────────────────────────
exports.getSingup = (req, res) => {
  if (req.session.isLoggedIn) return res.redirect("/");
  res.render("auth/signup", {
    pageTitle: "Create Account — Campus Jobs",
    currentPage: "signup",
    isLoggedIn: false,
    user: {},
    errors: [],
    oldInput: { firstName: "", lastName: "", email: "", userType: "" },
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    appUrl: APP_URL,
  });
};

// ─── GET /sso-callback ──────────────────────────────────────────────────────
// Clerk redirects here after a successful sign-in or sign-up.
// We sync the Clerk user into MongoDB, then set our express-session.
exports.clerkCallback = async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      console.log("[clerkCallback] No Clerk userId — session not established yet.");
      return res.redirect("/login");
    }

    // Fetch full Clerk profile
    const clerkUser = await clerkClient.users.getUser(userId);
    const email     = clerkUser.emailAddresses[0]?.emailAddress || "";
    const firstName = clerkUser.firstName || "User";
    const lastName  = clerkUser.lastName  || "";
    const avatar    = clerkUser.imageUrl  || "";

    // Find existing user by clerkId OR email (handles legacy accounts)
    let user = await User.findOne({ $or: [{ clerkId: userId }, { email }] });
    let isNewUser = false;

    if (!user) {
      // Brand-new signup via Clerk
      isNewUser = true;
      user = new User({
        clerkId: userId,
        firstName,
        lastName,
        email,
        avatar,
        userType: "guest",
        profileComplete: false,
      });
      await user.save();
    } else {
      // Returning user — patch any missing fields
      let changed = false;
      if (!user.clerkId)          { user.clerkId = userId;  changed = true; }
      if (!user.avatar && avatar) { user.avatar  = avatar;  changed = true; }
      if (changed) await user.save();
    }

    // New user: needs to pick a role first
    if (!user.profileComplete) {
      req.session.pendingUserId = user._id.toString();
      await req.session.save();
      return res.redirect("/complete-profile");
    }

    // Returning user: set session and go to dashboard
    req.session.isLoggedIn = true;
    req.session.user = user.toObject();
    await req.session.save();

    res.redirect(user.userType === "host" ? "/host-home-list" : "/");
  } catch (err) {
    console.error("[clerkCallback Error]", err);
    res.redirect("/login");
  }
};

// ─── GET /complete-profile ──────────────────────────────────────────────────
exports.getCompleteProfile = (req, res) => {
  if (!req.session.pendingUserId) return res.redirect("/login");
  res.render("auth/complete-profile", {
    pageTitle: "Choose Your Role — Campus Jobs",
    currentPage: "signup",
    isLoggedIn: false,
    user: {},
    errors: [],
  });
};

// ─── POST /complete-profile ─────────────────────────────────────────────────
exports.postCompleteProfile = async (req, res) => {
  try {
    const { userType } = req.body;
    const pendingUserId = req.session.pendingUserId;

    if (!pendingUserId) return res.redirect("/login");

    if (!["guest", "host"].includes(userType)) {
      return res.render("auth/complete-profile", {
        pageTitle: "Choose Your Role — Campus Jobs",
        currentPage: "signup",
        isLoggedIn: false,
        user: {},
        errors: ["Please select a valid role."],
      });
    }

    const user = await User.findByIdAndUpdate(
      pendingUserId,
      { userType, profileComplete: true },
      { new: true }
    );
    if (!user) return res.redirect("/login");

    delete req.session.pendingUserId;
    req.session.isLoggedIn = true;
    req.session.user = user.toObject();
    await req.session.save();

    res.redirect(userType === "host" ? "/host-home-list" : "/");
  } catch (err) {
    console.error("[postCompleteProfile Error]", err);
    res.redirect("/login");
  }
};

// ─── POST /logout ────────────────────────────────────────────────────────────
exports.postLogout = async (req, res) => {
  try {
    const { sessionId } = getAuth(req);
    if (sessionId) {
      await clerkClient.sessions.revokeSession(sessionId);
    }
  } catch (err) {
    console.error("[postLogout Clerk Error]", err);
  }

  req.session.destroy(() => {
    res.redirect("/login");
  });
};

// ─── Guest Login (one-click demo access) ────────────────────────────────────
exports.guestLogin = async (req, res) => {
  try {
    const GUEST_EMAIL = "guest@campusjobs.demo";
    let guestUser = await User.findOne({ email: GUEST_EMAIL });

    if (!guestUser) {
      const dummyHash = await bcrypt.hash(
        "GuestAcc@" + Math.random().toString(36).slice(2),
        12
      );
      guestUser = new User({
        firstName: "Guest",
        lastName: "Student",
        email: GUEST_EMAIL,
        password: dummyHash,
        userType: "guest",
        profileComplete: true,
        bio: "Exploring campus micro-jobs as a guest visitor.",
        skills: [],
        location: "Campus",
        expectedPrice: 0,
      });
      await guestUser.save();
    }

    req.session.isLoggedIn = true;
    req.session.user = guestUser;
    await req.session.save((err) => {
      if (err) console.log("[GuestLogin] Session save error:", err);
      res.redirect("/homes");
    });
  } catch (err) {
    console.error("[GuestLogin Error]", err);
    res.redirect("/login");
  }
};

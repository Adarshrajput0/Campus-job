const { clerkClient, getAuth } = require("@clerk/express");
const User = require("../models/user");
const bcrypt = require("bcryptjs");

const SIGN_IN_URL = process.env.CLERK_SIGN_IN_URL;
const SIGN_UP_URL = process.env.CLERK_SIGN_UP_URL;
const APP_URL     = process.env.APP_URL || "http://localhost:3005";

// ─── GET /login → render embedded Clerk sign-in ────────────────────────────
exports.getLogin = (req, res) => {
  if (req.session.isLoggedIn) return res.redirect("/");

  // Pick up any flash errors (e.g. domain access denied)
  const flashError = req.session.flashError || null;
  const signOutClerk = req.session.signOutClerk || false;
  delete req.session.flashError;
  delete req.session.signOutClerk;

  res.render("auth/login", {
    pageTitle: "Sign In — Campus Jobs",
    currentPage: "login",
    isLoggedIn: false,
    user: {},
    errors: flashError ? [flashError] : [],
    signOutClerk: signOutClerk,
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
      if (!req.query.synced) {
        // First hit: render SSO handshake page so Clerk JS can exchange tokens
        return res.render("auth/sso-callback", {
          pageTitle: "Authenticating — Parul MIS",
          clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        });
      }
      console.log("[clerkCallback] No Clerk userId after token exchange — redirecting to login.");
      return res.redirect("/login");
    }

    // Fetch full Clerk profile
    const clerkUser = await clerkClient.users.getUser(userId);
    const email     = clerkUser.emailAddresses[0]?.emailAddress || "";
    const firstName = clerkUser.firstName || "User";
    const lastName  = clerkUser.lastName  || "";
    const avatar    = clerkUser.imageUrl  || "";

    console.log(`[clerkCallback] Auth success for: ${email} (clerkId: ${userId})`);

    // ── STEP 1: All emails are allowed to sign in via Clerk ───────────────
    // Parul University emails (@paruluniversity.ac.in) get auto-verified privileges.
    // All other emails (Gmail, Outlook, etc.) can sign in as student or host.
    const { validateUniversityEmail } = require("../middleware/authMiddleware");
    const isParulEmail = validateUniversityEmail(email);
    console.log(`[clerkCallback] Email domain check: ${email} — isParulEmail: ${isParulEmail}`);
    // No domain block — all users are welcome

    // ── STEP 2: Find or Create user in MongoDB ─────────────────────────────
    let user = await User.findOne({ clerkId: userId });

    if (!user && email) {
      // Check if a legacy/email-only account exists
      user = await User.findOne({ email });
      if (user) {
        user.clerkId = userId;
        if (!user.avatar && avatar) user.avatar = avatar;
        await user.save();
        console.log(`[clerkCallback] Linked existing email account to Clerk: ${email}`);
      }
    }

    if (!user) {
      // Brand-new user — create a skeleton record and send to registration
      user = new User({
        clerkId: userId,
        firstName,
        lastName,
        email,
        universityEmail: email, // pre-fill with verified Clerk email
        avatar,
        userType: "guest",
        profileComplete: false,
      });
      await user.save();
      console.log(`[clerkCallback] New user created in MongoDB: ${email} (_id: ${user._id})`);
      // Auto-upgrade returning users to approved verification status
      let updatedNeeded = false;
      if (!user.avatar && avatar) {
        user.avatar = avatar;
        updatedNeeded = true;
      }
      if (user.verificationStatus !== "approved" || !user.isVerified) {
        user.verificationStatus = "approved";
        user.isVerified = true;
        updatedNeeded = true;
      }
      if (user.hostVerificationStatus !== "approved" || !user.isHostVerified) {
        user.hostVerificationStatus = "approved";
        user.isHostVerified = true;
        updatedNeeded = true;
      }
      if (updatedNeeded) {
        await user.save();
      }
      console.log(`[clerkCallback] Returning user found & auto-approved: ${email} (profileComplete: ${user.profileComplete})`);
    }


    // ── STEP 3: Route based on profile completion ──────────────────────────
    if (user.profileComplete && user.userType !== "guest") {
      // Fully registered — send to their dashboard
      delete req.session.pendingUserId;
      req.session.isLoggedIn = true;
      req.session.user = user.toObject();
      return req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        if (user.userType === "admin") return res.redirect("/admin/dashboard");
        if (user.userType === "host")  return res.redirect("/host-home-list");
        return res.redirect("/");
      });
    }

    // Profile incomplete (new user or guest) — must fill registration form
    req.session.pendingUserId = user._id.toString();
    delete req.session.isLoggedIn;
    delete req.session.user;
    console.log(`[clerkCallback] Redirecting to /complete-profile for: ${email}`);
    return req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      res.redirect("/complete-profile");
    });

  } catch (err) {
    console.error("[clerkCallback Error]", err);
    res.redirect("/login");
  }
};

// ─── GET /complete-profile ──────────────────────────────────────────────────
exports.getCompleteProfile = async (req, res) => {
  // If already fully logged in, redirect to their dashboard
  if (req.session.isLoggedIn && req.session.user) {
    return res.redirect(req.session.user.userType === "host" ? "/host-home-list" : "/");
  }

  const pendingUserId = req.session.pendingUserId;
  if (!pendingUserId) return res.redirect("/login");

  // Double-check: if the pending user already has a complete profile, skip this step
  try {
    const user = await User.findById(pendingUserId);
    if (user && user.profileComplete) {
      delete req.session.pendingUserId;
      req.session.isLoggedIn = true;
      req.session.user = user.toObject();
      return req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        res.redirect(user.userType === "host" ? "/host-home-list" : "/");
      });
    }

    res.render("auth/complete-profile", {
      pageTitle: "Parul University Verification & Setup",
      currentPage: "signup",
      isLoggedIn: false,
      user: user || {},
      errors: [],
    });
  } catch (e) {
    console.error("[getCompleteProfile lookup error]", e);
    res.redirect("/login");
  }
};

// ─── POST /complete-profile ─────────────────────────────────────────────────
exports.postCompleteProfile = async (req, res) => {
  try {
    const {
      userType,
      fullName,
      universityEmail,
      campusLocation,
      // Student details
      enrollmentNo,
      department,
      branch,
      semester,
      division,
      graduationYear,
      resume,
      // Host details
      organization,
      universityAffiliation,
      contactInfo,
      hostDescription,
    } = req.body;

    const pendingUserId = req.session.pendingUserId || (req.session.user && req.session.user._id);

    if (!pendingUserId) return res.redirect("/login");

    const { validateUniversityEmail } = require("../middleware/authMiddleware");

    let roleToAssign = userType;
    if (roleToAssign === "guest") roleToAssign = "student";

    if (!["student", "host", "admin"].includes(roleToAssign)) {
      return res.render("auth/complete-profile", {
        pageTitle: "Parul University Verification & Setup",
        currentPage: "signup",
        isLoggedIn: false,
        user: req.session.user || {},
        errors: ["Please select a valid role (Student or Host)."],
      });
    }

    const targetUser = await User.findById(pendingUserId);
    if (!targetUser) return res.redirect("/login");

    // Split Full Name into firstName and lastName if provided
    let updatedFirstName = targetUser.firstName;
    let updatedLastName = targetUser.lastName || "";
    if (fullName && fullName.trim()) {
      const nameParts = fullName.trim().split(" ");
      updatedFirstName = nameParts[0];
      updatedLastName = nameParts.slice(1).join(" ");
    }

    // Check if admin email match
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@paruluniversity.ac.in").toLowerCase();
    const effectiveEmail = (universityEmail || targetUser.email || "").trim().toLowerCase();

    if (effectiveEmail === adminEmail) {
      roleToAssign = "admin";
    }

    const selectedLocation = (campusLocation || req.body.hostCampusLocation || targetUser.campusLocation || "").trim();

    const updateData = {
      userType: roleToAssign,
      profileComplete: true,
      firstName: updatedFirstName,
      lastName: updatedLastName,
      campusLocation: selectedLocation,
      location: selectedLocation,
    };

    if (roleToAssign === "student") {
      // All emails are allowed — Parul emails get auto-verified once admin approves,
      // non-Parul emails also go through manual admin review.
      updateData.universityEmail = effectiveEmail;
      if (universityEmail && universityEmail.trim() !== "") {
        updateData.email = effectiveEmail;
      }
      updateData.enrollmentNo = enrollmentNo ? enrollmentNo.trim() : "";
      updateData.department = department || "";
      updateData.branch = branch || "";
      updateData.semester = semester || "";
      updateData.division = division || "";
      updateData.graduationYear = graduationYear ? Number(graduationYear) : null;
      updateData.resume = resume || targetUser.resume || "";
      updateData.verificationStatus = "approved";
      updateData.isVerified = true;

    } else if (roleToAssign === "host") {
      updateData.organization = organization || "";
      updateData.universityAffiliation = universityAffiliation || "";
      updateData.contactInfo = contactInfo || "";
      updateData.hostDescription = hostDescription || "";

      // Auto-approve all hosts instantly
      updateData.hostVerificationStatus = "approved";
      updateData.isHostVerified = true;
      updateData.verificationStatus = "approved";
      updateData.isVerified = true;

    } else if (roleToAssign === "admin") {
      updateData.isVerified = true;
      updateData.verificationStatus = "approved";
      updateData.isHostVerified = true;
      updateData.hostVerificationStatus = "approved";
    }

    console.log(`[postCompleteProfile] Saving profile for userId=${pendingUserId}, role=${roleToAssign}`);
    const updatedUser = await User.findByIdAndUpdate(pendingUserId, updateData, { new: true, runValidators: false });

    if (!updatedUser) {
      console.error(`[postCompleteProfile] findByIdAndUpdate returned null for id=${pendingUserId}`);
      return res.redirect("/login");
    }

    console.log(`[postCompleteProfile] ✅ Profile saved for ${updatedUser.email} (${roleToAssign})`);

    delete req.session.pendingUserId;
    req.session.isLoggedIn = true;
    req.session.user = updatedUser.toObject();

    return req.session.save((err) => {
      if (err) console.error("Session save error:", err);
      if (roleToAssign === "admin") return res.redirect("/admin/dashboard");
      if (roleToAssign === "host") return res.redirect("/host-home-list");
      return res.redirect("/");
    });
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

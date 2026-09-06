const User = require("../models/user");
const Job = require("../models/job");
const Booking = require("../models/booking");
const { createNotification } = require("../utils/notificationUtil");

// ─── GET /admin/dashboard ───────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    // 1. KPI Statistics
    const totalStudents = await User.countDocuments({ userType: { $in: ["student", "guest"] } });
    const verifiedStudents = await User.countDocuments({ userType: { $in: ["student", "guest"] }, verificationStatus: "approved" });
    const pendingStudents = await User.countDocuments({ userType: { $in: ["student", "guest"] }, verificationStatus: "pending" });

    const totalHosts = await User.countDocuments({ userType: "host" });
    const verifiedHosts = await User.countDocuments({ userType: "host", hostVerificationStatus: "approved" });
    const pendingHosts = await User.countDocuments({ userType: "host", hostVerificationStatus: "pending" });

    const totalJobs = await Job.countDocuments({});
    const pendingJobs = await Job.countDocuments({ status: "pending" });
    const approvedJobs = await Job.countDocuments({ status: { $in: ["approved", "active"] } });
    const totalApplications = await Booking.countDocuments({});

    // 2. Moderation Queues
    const pendingStudentList = await User.find({ userType: { $in: ["student", "guest"] }, verificationStatus: "pending" }).sort({ createdAt: -1 });
    const pendingHostList = await User.find({ userType: "host", hostVerificationStatus: "pending" }).sort({ createdAt: -1 });
    const pendingJobList = await Job.find({ status: "pending" }).populate("owner").populate("host").sort({ createdAt: -1 });

    res.render("admin/dashboard", {
      pageTitle: "Admin MIS Dashboard — Parul University",
      currentPage: "admin-dashboard",
      isLoggedIn: true,
      user: req.session.user,
      stats: {
        totalStudents,
        verifiedStudents,
        pendingStudents,
        totalHosts,
        verifiedHosts,
        pendingHosts,
        totalJobs,
        pendingJobs,
        approvedJobs,
        totalApplications,
      },
      pendingStudents: pendingStudentList,
      pendingHosts: pendingHostList,
      pendingJobs: pendingJobList,
    });
  } catch (err) {
    console.error("[getAdminDashboard Error]", err);
    res.redirect("/");
  }
};

// ─── POST /admin/students/:id/approve ──────────────────────────────────────
exports.postApproveStudent = async (req, res) => {
  try {
    const studentId = req.params.id;
    const student = await User.findById(studentId);
    if (student) {
      student.verificationStatus = "approved";
      student.isVerified = true;
      student.rejectionReason = "";
      await student.save();

      await createNotification({
        app: req.app,
        userId: student._id,
        title: "Account Verified! 🎓",
        message: "Your Parul University student profile has been approved by the Admin. You can now apply for micro-jobs!",
        type: "student_verification",
      });
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postApproveStudent Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── POST /admin/students/:id/reject ───────────────────────────────────────
exports.postRejectStudent = async (req, res) => {
  try {
    const studentId = req.params.id;
    const { rejectionReason } = req.body;
    const student = await User.findById(studentId);
    if (student) {
      student.verificationStatus = "rejected";
      student.isVerified = false;
      student.rejectionReason = rejectionReason || "University credentials could not be verified.";
      await student.save();

      await createNotification({
        app: req.app,
        userId: student._id,
        title: "Verification Update ⚠️",
        message: `Your student verification request was rejected. Reason: ${student.rejectionReason}`,
        type: "student_verification",
      });
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postRejectStudent Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── POST /admin/hosts/:id/approve ─────────────────────────────────────────
exports.postApproveHost = async (req, res) => {
  try {
    const hostId = req.params.id;
    const host = await User.findById(hostId);
    if (host) {
      host.hostVerificationStatus = "approved";
      host.isHostVerified = true;
      await host.save();

      await createNotification({
        app: req.app,
        userId: host._id,
        title: "Host Account Approved! 🏛️",
        message: "Your organization account has been verified by Parul University Admin. You can now post micro-jobs!",
        type: "host_verification",
      });
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postApproveHost Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── POST /admin/hosts/:id/reject ──────────────────────────────────────────
exports.postRejectHost = async (req, res) => {
  try {
    const hostId = req.params.id;
    const host = await User.findById(hostId);
    if (host) {
      host.hostVerificationStatus = "rejected";
      host.isHostVerified = false;
      await host.save();

      await createNotification({
        app: req.app,
        userId: host._id,
        title: "Host Verification Update",
        message: "Your host account request was rejected by Parul University Admin.",
        type: "host_verification",
      });
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postRejectHost Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── POST /admin/jobs/:id/approve ───────────────────────────────────────────
exports.postApproveJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId);
    if (job) {
      job.status = "approved";
      await job.save();

      const hostId = job.host || job.owner;
      if (hostId) {
        await createNotification({
          app: req.app,
          userId: hostId,
          title: "Job Approved! 🚀",
          message: `Your job posting "${job.title || job.houseName}" has been approved and is now live for students.`,
          type: "job_approval",
          relatedJob: job._id,
        });
      }
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postApproveJob Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── POST /admin/jobs/:id/reject ────────────────────────────────────────────
exports.postRejectJob = async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findById(jobId);
    if (job) {
      job.status = "rejected";
      await job.save();

      const hostId = job.host || job.owner;
      if (hostId) {
        await createNotification({
          app: req.app,
          userId: hostId,
          title: "Job Listing Rejected",
          message: `Your job posting "${job.title || job.houseName}" was rejected during admin moderation.`,
          type: "job_rejection",
          relatedJob: job._id,
        });
      }
    }
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("[postRejectJob Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── GET /admin/reports ─────────────────────────────────────────────────────
exports.getReports = async (req, res) => {
  try {
    const { department, branch, status } = req.query;

    // Filter query
    let studentMatch = { userType: { $in: ["student", "guest"] } };
    if (department) studentMatch.department = department;
    if (branch) studentMatch.branch = branch;

    const students = await User.find(studentMatch);
    
    // Aggregation 1: Students per Department
    const departmentStats = await User.aggregate([
      { $match: { userType: { $in: ["student", "guest"] } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]);

    // Aggregation 2: Jobs per Category
    const categoryStats = await Job.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    // Aggregation 3: Applications per Status
    const applicationStatusStats = await Booking.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    res.render("admin/reports", {
      pageTitle: "MIS Reports & Analytics — Parul University",
      currentPage: "admin-reports",
      isLoggedIn: true,
      user: req.session.user,
      students,
      departmentStats,
      categoryStats,
      applicationStatusStats,
      filters: { department: department || "", branch: branch || "", status: status || "" },
    });
  } catch (err) {
    console.error("[getReports Error]", err);
    res.redirect("/admin/dashboard");
  }
};

// ─── GET /admin/export-csv ──────────────────────────────────────────────────
exports.exportCSV = async (req, res) => {
  try {
    const { type } = req.query; // 'students' or 'applications' or 'jobs'

    let csvContent = "";
    let filename = "mis_report.csv";

    if (type === "students") {
      filename = "parul_university_students.csv";
      csvContent = "Full Name,Email,Enrollment No,Student ID,Department,Branch,Semester,Verification Status\n";
      const students = await User.find({ userType: { $in: ["student", "guest"] } });
      students.forEach(s => {
        const name = `"${s.firstName} ${s.lastName || ''}"`;
        csvContent += `${name},${s.email || ''},${s.enrollmentNo || ''},${s.studentId || ''},"${s.department || ''}","${s.branch || ''}",${s.semester || ''},${s.verificationStatus || 'pending'}\n`;
      });
    } else if (type === "applications") {
      filename = "parul_university_applications.csv";
      csvContent = "Application ID,Job Title,Student Email,Status,Applied Date\n";
      const apps = await Booking.find({}).populate("home").populate("user");
      apps.forEach(a => {
        const title = a.home ? `"${a.home.title || a.home.houseName}"` : '"Unknown"';
        const email = a.user ? a.user.email : 'N/A';
        csvContent += `${a._id},${title},${email},${a.status || 'applied'},${a.createdAt ? a.createdAt.toISOString() : ''}\n`;
      });
    } else {
      filename = "parul_university_jobs.csv";
      csvContent = "Job ID,Title,Category,Stipend,Location,Status,Created At\n";
      const jobs = await Job.find({});
      jobs.forEach(j => {
        csvContent += `${j._id},"${j.title || j.houseName}",${j.category || 'General'},${j.price || j.stipend || 0},"${j.location || ''}",${j.status || 'pending'},${j.createdAt ? j.createdAt.toISOString() : ''}\n`;
      });
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error("[exportCSV Error]", err);
    res.redirect("/admin/dashboard");
  }
};

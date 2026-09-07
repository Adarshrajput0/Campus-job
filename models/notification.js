const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "student_verification",
        "host_verification",
        "job_approval",
        "job_rejection",
        "application_status",
        "interview_scheduled",
        "system",
      ],
      default: "system",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },
    relatedApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);

const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      default: "General",
    },
    requiredSkills: {
      type: [String],
      default: [],
    },
    stipend: {
      type: Number,
      required: true,
      default: 0,
    },
    location: {
      type: String,
      required: true,
      default: "Parul University Campus",
    },
    jobType: {
      type: String,
      enum: ["Part-Time", "Full-Time", "Project-Based", "Gig", "Internship"],
      default: "Part-Time",
    },
    duration: {
      type: String,
      default: "Flexible",
    },
    numberOfPositions: {
      type: Number,
      default: 1,
    },
    applicationDeadline: {
      type: Date,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "active", "closed", "completed"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    photo: {
      type: String,
      default: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=1200",
    },
    photos: [String],
    attachments: [
      {
        url: String,
        name: String,
        type: String,
      },
    ],
    // Backward compatibility aliases for Home model fields
    houseName: String,
    price: Number,
    rating: { type: Number, default: 5 },
    maxguest: { type: Number, default: 1 },
    propertytype: { type: String, default: "Task" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Pre-validate hook to ensure attachments and skills are clean arrays/objects
jobSchema.pre("validate", function (next) {
  if (typeof this.attachments === "string") {
    try {
      this.attachments = JSON.parse(this.attachments);
    } catch (e) {
      this.attachments = [];
    }
  }
  if (Array.isArray(this.attachments)) {
    this.attachments = this.attachments.map((item) => {
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item);
          return typeof parsed === "object" && parsed !== null ? parsed : { url: item, name: "Attachment", type: "application/octet-stream" };
        } catch (e) {
          return { url: item, name: "Attachment", type: "application/octet-stream" };
        }
      }
      return item;
    });
  }
  next();
});

// Pre-save hook to keep backward compatibility fields in sync
jobSchema.pre("save", function (next) {
  if (!this.houseName && this.title) this.houseName = this.title;
  if (!this.price && this.stipend) this.price = this.stipend;
  if (!this.owner && this.host) this.owner = this.host;
  if (!this.title && this.houseName) this.title = this.houseName;
  if (!this.stipend && this.price) this.stipend = this.price;
  if (!this.host && this.owner) this.host = this.owner;
  next();
});

const Job = mongoose.models.Job || mongoose.model("Job", jobSchema, "jobs");

if (!mongoose.models.Home) {
  mongoose.model("Home", jobSchema, "jobs");
}
if (!mongoose.models.Task) {
  mongoose.model("Task", jobSchema, "jobs");
}

module.exports = Job;




const mongoose = require("mongoose");
const homeSchema = mongoose.Schema({
  houseName: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
  },
  photo: String,        // legacy single photo (kept for backward compat)
  photos: [String],     // all uploaded image URLs
  attachments: [        // non-image files (PDFs, docs, etc.)
    {
      url:  String,
      name: String,
      type: String,     // mime type e.g. "application/pdf"
    }
  ],
  description: String,
  maxguest: {
    type: Number,
    required: true,
  },
  propertytype: {
    type: String,
    required: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

module.exports = mongoose.model("Home", homeSchema);


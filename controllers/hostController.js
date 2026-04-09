const Home = require("../models/home");

exports.getAddHome = (req, res, next) => {
  res.render("host/edithome", {
    pageTitle: "Add jobs to platform",
    currentPage: "addHome",
    editing: false,
    isLoggedIn: req.isLoggedIn,
    user: req.session.user,
  });
};

exports.getEditHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("RAW ID FROM URL:", homeId);
  console.log("TYPE:", typeof homeId);
  const editing = req.query.editing === "true";
  console.log("EDIT ID FROM URL:", homeId);

  Home.findById(homeId).then((home) => {
    console.log("HOME FOUND:", home);
    if (!home) {
      console.log("Home not found for editing!");
      return res.redirect("/host-home-list");
    }
    console.log(homeId, editing, home);
    res.render("host/edithome", {
      home: home,
      pageTitle: "Edit your home",
      currentPage: "host-homes",
      editing: editing,
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  });
};

exports.getHostHomes = (req, res, next) => {
  Home.find().then((registeredHomes) => {
    res.render("host/host-home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Host Homes List",
      currentPage: "host-homes",
      isLoggedIn: req.isLoggedIn,
      user: req.session.user,
    });
  });
};

exports.postAddHome = (req, res, next) => {
  const {
    houseName,
    price,
    location,
    rating,
    description,
    maxguest,
    propertytype,
  } = req.body;
  console.log(
    houseName,
    price,
    location,
    rating,
    description,
    maxguest,
    propertytype,
  );
  console.log("Received file:", req.file);

  if (!req.file) {
    return res.status(422).send("No file uploaded or invalid file type.");
  }

  // const photo = req.file.path;
  const photo = req.file.path; // Cloudinary URL
  const home = new Home({
    houseName,
    price,
    location,
    rating,
    photo,
    description,
    maxguest,
    propertytype,
  });
  home.save().then(() => {
    console.log("Home Saved Sucessfully");
  });

  res.redirect("/host-home-list");
};

exports.postEditHome = (req, res, next) => {
  const {
    id,
    houseName,
    price,
    location,
    rating,
    description,
    maxguest,
    propertytype,
  } = req.body;
  //  const photo = req.file.path;

  Home.findById(id)
    .then((home) => {
      home.houseName = houseName;
      home.price = price;
      home.location = location;
      home.rating = rating;
      home.description = description;
      home.maxguest = maxguest;
      home.propertytype = propertytype;

      if (req.file) {
        home.photo = req.file.path;
      }

      home
        .save()
        .then((result) => {
          console.log("Home updated", result);
        })
        .catch((err) => {
          console.log("Error while updating", err);
        });
      res.redirect("/host-home-list");
    })
    .catch((err) => {
      console.log("Error while updating", err);
    });
};

exports.postDeleteHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("Came to delete ", homeId);
  Home.findByIdAndDelete(homeId)
    .then(() => {
      res.redirect("/host-home-list");
    })
    .catch((error) => {
      console.log("Error while deleting ", error);
    });
};

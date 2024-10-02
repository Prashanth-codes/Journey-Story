require("dotenv").config();
const mongoose = require('mongoose');

const bcrypt = require('bcrypt');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const config = require('./config.json');
const upload = require('./multer');
const fs=require("fs");
const path=require("path");

const {authenticateToken} = require('./utilities');


const User = require("./models/userModel");
const TravelStory = require("./models/travelStory.model");


mongoose.connect(process.env.URL)
    .then(() => {
        console.log("Connected to mongodb");
    })
    .catch(err => console.log("Failed to connect to database"));

const app=express();
app.use(express.json());
app.use(cors({origin: "*"}));


//create account
app.post('/create-account',async(req,res)=>{
    const {fullName,email,password}=req.body;
    if(!fullName || !email || !password){
        return res.status(400).json({error: true,message: "All fields are required"});
    }
    const isUser = await User.findOne({email});
    if(isUser){
        return res.status(400).json({error: true, message: "User Already exists"});
    }

    const hashedPassword = await bcrypt.hash(password,10);
    const user = new User({
        fullName,
        email,
        password: hashedPassword
    })

    await user.save();

//     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// 1f06f81f5b164c3f0f2147140054c1a55b1c5270c503297580c22b8a188c3601014a5c68b10aee22cf0919ba3accd29c42414c987370359aff0a86a6ceb9b8b5
    const accessToken = jwt.sign(
        {userId: user._id},
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "48h",
        }
    );
    return res.status(201).json({error: false,
        user: {fullName: user.fullName,email: user.email},
        accessToken,
        message: "Registration Successful",
    })

});


//login
app.post('/login',async (req,res)=>{
    const {email,password} = req.body;
    if(!email || !password){
        return res.status(400).json({message: "Email and password are required"});
    }
    const user = await User.findOne({email});
    if(!user){
        return res.status(400).json({message: "User not found"});
    }
    const isPasswordValid = await bcrypt.compare(password,user.password);
    if(!isPasswordValid){
        return res.status(400).json({message: "Invalid password"});
    }

    const accessToken = jwt.sign(
        {userId: user._id},
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: "7d",
        }
    );
    return res.json({
        error: false,
        message: "Login Successful",
        user: {fullName: user.fullName,email: user.email},
        accessToken,
    })
})


//get user
app.get('/get-user',authenticateToken,async (req,res)=>{
    const {userId} = req.user;
    const isUser = await User.findOne({_id: userId});
    if(!isUser)
        return res.sendStatus(401);
    return res.json({user: isUser, message: "",})
})


//route to handle image upload

app.post("/image-upload", upload.single("image"), async (req, res) => {
    try {
        //console.log("Received request for image upload");
        if (!req.file) {
            //console.log("No file uploaded");
            return res.status(400).json({ error: true, message: "No image uploaded" });
        }

        const imageUrl = `http://localhost:8000/uploads/${req.file.filename}`;
        //console.log(`Image uploaded successfully: ${imageUrl}`);
        res.status(200).json({ imageUrl });
    } catch (error) {
        //console.error("Error during image upload:", error);
        res.status(500).json({ error: true, message: error.message });
    }
});

//delete an image from folder
app.delete("/delete-image",async (req,res)=>{
    const {imageUrl}=req.query;

    if(!imageUrl){
        return res.status(400).json({error:true, message: 'image Url is required'});
    }

    try{
        //extract file name

        const filename=path.basename(imageUrl);
        const filePath=path.join(__dirname,'uploads',filename);

        //chekc file exist
        if(fs.existsSync(filePath)){
            fs.unlinkSync(filePath);
            res.status(200).json({message: 'image deleted successfully'});
        }
        else{
            res.status(404).json({error: true,message: "Image not found"});
        }
    }
    catch(error){
        res.status(500).json({error:true,message: error.message});
    }
})


//serve static files from the uploads and assets dictionary

app.use("/uploads",express.static(path.join(__dirname,"uploads")));
app.use("/assets",express.static(path.join(__dirname,"assets")));


//Add Travel Story
app.post("/add-travel-story", authenticateToken, async (req, res) => {
    const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
    const { userId } = req.user;

    if (!title || !story || !visitedLocation || !imageUrl || !visitedDate) {
        return res.status(400).json({ error: true, message: 'All fields are required' });
    }

    const parsedVisitedDate = new Date(parseInt(visitedDate));
    
    if (isNaN(parsedVisitedDate.getTime())) {
        return res.status(400).json({ error: true, message: 'Invalid visitedDate format' });
    }

    try {
        const travelStory = new TravelStory({
            title,
            story,
            visitedLocation,
            imageUrl,
            visitedDate: parsedVisitedDate,
            userId
        });

        await travelStory.save();
        res.status(201).json({ story: travelStory, message: 'Added successfully' });

    } catch (error) {
        // Log the error for debugging
        console.error("Error while adding travel story:", error);
        
        // Send detailed error response
        res.status(500).json({ error: true, message: error.message || 'Something went wrong' });
    }
});




//get all travel stories

app.get("/get-all-stories",authenticateToken,async (req,res)=>{
    const {userId}=req.user;
    try{
        const travelStories = await TravelStory.find({userId: userId}).sort({
            isFavourite: -1,
        });
        res.status(200).json({stories: travelStories});
    }catch(error){
        res.status(500).json({error: true,message: error.message});
    }
})

app.get("/get-stories", authenticateToken, async (req, res) => {
    try {
        // Fetch all travel stories, sorted by isFavourite (descending)
        const travelStories = await TravelStory.find({}).sort({
            isFavourite: -1,
        });

        res.status(200).json({ stories: travelStories });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});



//edit story
app.put("/edit-story/:id",authenticateToken,async(req,res)=>{
    const {id} = req.params;
    const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
    const {userId} = req.user;


    if (!title || !story || !visitedLocation || !visitedDate) {
        return res.status(400).json({ error: true, message: 'All fields are required' });
    }

    const parsedVisitedDate = new Date(parseInt(visitedDate));
    
    if (isNaN(parsedVisitedDate.getTime())) {
        return res.status(400).json({ error: true, message: 'Invalid visitedDate format' });
    }

    try{
        //find travel story by id and ensure it belongs to authenticated user
        const travelStory = await TravelStory.findOne({_id: id,userId: userId});
        if(!travelStory){
            return res.status(404).json({error:true, message: "Travel Story not found"});
        }

        const placeholderImgUrl = `http:localhost:8000/assets/placeholder.jpeg`;

        travelStory.title = title;
        travelStory.story = story;
        travelStory.visitedLocation = visitedLocation;
        travelStory.imageUrl = imageUrl || placeholderImgUrl;
        travelStory.visitedDate = parsedVisitedDate;
        
        await travelStory.save();
        res.status(200).json({story: travelStory,message:'update success'});
    }
    catch(error){
        res.status(500).json({error: true,message: error.message});
    }
})


//delete a story
app.delete("/delete-story/:id",authenticateToken,async (req,res) =>{
    const {id} = req.params;
    const {userId} = req.user;

    try{
        //find story by id and ensure it belongs to authenicated user
        const travelStory = await TravelStory.findOne({_id: id,userId: userId});
        if(!travelStory){
            return res.status(404).json({error:true, message: "Travel Story not found"});
        }

        //delete the story from db
        await travelStory.deleteOne({_id: id,userId:userId});

        const imageUrl = travelStory.imageUrl;
        //console.log("Stored image URL:", travelStory.imageUrl);
        const filename = path.basename(imageUrl);

        const filePath = path.resolve(__dirname, 'uploads', filename);

        if (fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Failed to delete image file', err);
                } else {
                    console.log('Image file deleted successfully');
                }
            });
        } else {
            console.log("Image file not found:", filePath);
        }

        res.status(200).json({message: "Travel stury deleted successfully"});
    }
    catch(error){
        res.status(500).json({error: true,message: error.message});
    }
})

//uodate is favourite
app.put("/update-is-favourite/:id",authenticateToken,async (req,res)=>{
    const {id} = req.params;
    const {isFavourite}=req.body;
    const {userId}=req.user;

    try{
        const travelStory = await TravelStory.findOne({_id:id,userId:userId});
        if(!travelStory){
            return res.status(404).json({error: true,message: "Travel strotu"})
        }

        travelStory.isFavourite = isFavourite;

        await travelStory.save();
        res.status(200).json({story: travelStory,message: 'update success'});
    }
    catch(error){
        res.status.json({error:true,message: error.message});
    }
})

// search travel stories

app.get("/search",authenticateToken,async (req,res)=>{
    const {query} = req.query;
    const {userId} = req.user;
    if(!query){
        return res.status(404).json({error: true,message: "query is required"});
    }
    try{
        const searchResults = await TravelStory.find({
            userId: userId,
            $or: [
                {title: {$regex: query,$options: "i"}},
                {story: {$regex: query,$options: "i"}},
                {visitedLocation: {$regex: query, $options: "i"}}
            ],
        }).sort({isFavourite: -1});
        res.status(200).json({stories: searchResults});
    }
    catch(error){
        res.status(500).json({error: true,message: error.message});
    }
})

//filter travel stories by date

app.get("/travel-stories/filter",authenticateToken,async (req,res) =>{
    const {startDate,endDate}=req.query;
    const {userId} = req.user;

    try{
        const start = new Date(parseInt(startDate));
        const end = new Date(parseInt(endDate));


        const filteredStories = await TravelStory.find({
            userId: userId,
            visitedDate: {$gte: start,$lte: end},
        }).sort({isFavourite: -1});

        res.status(200).json({stories: filteredStories});
    }
    catch(error){
        res.status(500).json({error:true, message: error.message});
    }
})

const port=process.env.PORT || 8000;

app.listen(port,()=>{
    console.log(`Server running successfully`);
});


module.exports = app
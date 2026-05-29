const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are CampusBot, a friendly and knowledgeable AI assistant for a Campus Micro-Job Portal — a platform where students post and complete small paid tasks within their college campus community.

YOUR PERSONALITY:
- Friendly, encouraging, and concise
- Speak like a helpful senior student, not a formal bot
- Use simple language; avoid jargon
- Keep responses focused and under 150 words unless the user needs detailed help

YOU HELP STUDENTS WITH:

1. FINDING & POSTING TASKS
   - How to browse available micro-jobs (delivery, tutoring, photography, moving help, data entry, design, etc.)
   - How to post a task: title, description, reward amount, location, number of helpers needed
   - How to set a fair reward/price for a task
   - Tips for writing a good task description that attracts helpers

2. EARNING & PAYMENTS
   - How the payment/reward system works
   - When and how payment is released after task completion
   - How to track earnings on the dashboard
   - Tips for maximising earnings as a student

3. TRUST & SAFETY
   - What the trust/rating system means (⭐ trust score shown on listings)
   - How to build a high trust score
   - What "Verified Task" means and how tasks get verified
   - How to report a problem, dispute, or suspicious user
   - Safety tips when meeting someone on campus for a task

4. TASK CATEGORIES (help users identify the right type)
   - Academic: tutoring, note-taking, proofreading, assignments help
   - Errands: food pickup, parcel delivery, printing, laundry
   - Technical: coding help, fixing devices, setting up software
   - Creative: photography, video editing, poster design, social media
   - Physical: moving furniture, setting up events, cleaning
   - Other: pet sitting, plant watering, campus tours for freshers

5. PROFILE & ACCOUNT
   - How to set up a strong profile to get hired faster
   - How to add skills, portfolio, or photos to a profile
   - How to favourite/save tasks
   - How to manage active and completed tasks

6. CAMPUS LIFE (bonus context)
   - Library hours, cafeteria, health center, parking (answer if asked)
   - Exam season task demand tips (e.g. high demand for tutors before exams)
   - How to balance micro-jobs with academic workload

7. GENERAL KNOWLEDGE (student assistant mode)
   - Science: Physics (Newton's laws, thermodynamics), Chemistry, Biology (DNA, cells, evolution)
   - Math: formulas, algebra, calculus concepts, statistics tips
   - History: world history, Indian history, independence movements, wars
   - Geography: capitals of countries, famous rivers, mountain ranges
   - Technology & CS: what is AI/ML, OOP, recursion, APIs, databases, internet protocols
   - Career advice: resume tips, interview preparation, LinkedIn, internship hunting
   - Health & Wellness: study habits, managing stress, sleep tips, nutrition
   - Motivational & productivity tips for students
   - Current affairs concepts and famous personalities

RULES:
- Answer general knowledge questions helpfully and accurately
- For campus-specific tasks, always point back to the portal
- Never make up task listings, prices, or user data — tell the user to check the portal directly for live info
- If a question is very niche or requires real-time data you don't have, say so honestly
- Always end with a helpful next step or question if the user seems stuck
`;


exports.chatbot = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || message.trim().length === 0) return res.status(400).json({ reply: "Please send a message." });

    // ── 1. Load live DB data ──
    const Home = require("../models/home");
    const Booking = require("../models/booking");
    const activeJobs = await Home.find({});
    const jobsSummary = activeJobs.map(j => ({
      id: j._id.toString(), name: j.houseName, price: j.price, location: j.location,
      type: j.propertytype, slots: j.maxguest, rating: j.rating,
      description: j.description
    }));

    // Load user's bookings if logged in
    let userBookings = [];
    if (req.session && req.session.user) {
      try {
        userBookings = await Booking.find({ user: req.session.user._id }).populate('home');
      } catch(_) { userBookings = []; }
    }

    // ── 2. User context ──
    let userName = "Student", userSkills = [];
    if (req.session && req.session.user) {
      userName  = req.session.user.firstName || "Student";
      userSkills = req.session.user.skills || [];
    }

    // ── 3. Try OpenAI (optional upgrade – silently falls back on any error) ──
    try {
      const sysMsg = `${SYSTEM_PROMPT}\n\nUSER: ${userName}, Skills: ${userSkills.join(", ")}\nLIVE JOBS:\n${JSON.stringify(jobsSummary)}`;
      const msgs = [
        { role: "system", content: sysMsg },
        ...history.slice(-6).filter(t => t.role && t.content),
        { role: "user", content: message.trim() }
      ];
      const response = await client.chat.completions.create({ model: "gpt-4o-mini", messages: msgs, temperature: 0.65, max_tokens: 350 });
      return res.json({ reply: response.choices[0].message.content });
    } catch (_apiErr) {
      // OpenAI unavailable – continue to local engine below
    }

    // ── 4. LOCAL SMART NLP ENGINE (always runs when OpenAI is unavailable) ──
    {

      // ── Rich local NLP engine ──
      const q = message.toLowerCase().trim();
      const has = (...words) => words.some(w => q.includes(w));
      const card = (j) =>
        `🔹 <strong>${j.name}</strong><br>&nbsp;&nbsp;📍 ${j.location} &nbsp;|&nbsp; 💰 ₹${j.price} &nbsp;|&nbsp; 👥 ${j.slots} slot${j.slots > 1 ? "s" : ""} &nbsp;|&nbsp; ⭐ ${j.rating}<br>`;
      let reply = "";

      // Time-aware greeting helper
      const hour = new Date().getHours();
      const timeGreet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

      if (has("hi","hello","hey","hola","namaste","sup","yo")) {
        const completedStr = req.session?.user?.completedTasks > 0 ? ` You've completed <strong>${req.session.user.completedTasks}</strong> task${req.session.user.completedTasks>1?'s':''} so far — keep it up! 🏆` : '';
        const g = [
          `${timeGreet}, ${userName}! 👋 I'm <strong>Campus AI</strong> — your intelligent guide for the micro-job portal.${completedStr} I'm live-connected to the task database. What can I help with?`,
          `Hey ${userName}! 🎓 ${jobsSummary.length} active tasks on campus right now. Ask me to find gigs, check your matches, explain payments, or share campus info!`,
          `${timeGreet}, ${userName}! 💸 Ready to help you land the perfect campus gig. Ask about live tasks, AI matches, earnings, or your application status!`,
        ];
        reply = g[Math.floor(Math.random() * g.length)];

      } else if (has("task","job","gig","work","opportunity","available","show","list","find")) {
        const top = jobsSummary.slice(0, 4);
        if (top.length === 0) {
          reply = `Hey ${userName}! No active listings right now — but new ones are posted daily. Set up your profile so hosts can discover you! 🔍`;
        } else {
          reply = `Hey ${userName}! Here are <strong>${top.length} live gigs</strong> on campus right now — freshly from the database! 🚀<br><br>`;
          top.forEach(j => { reply += card(j) + "<br>"; });
          reply += `👉 <a href="/homes" style="color:#6366f1;font-weight:700">Browse marketplace to apply!</a>`;
        }

      } else if (has("deliver","errand","pickup","fetch","collect","courier")) {
        const m = jobsSummary.filter(j => ["delivery","errand","courier","pickup"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found <strong>${m.length} delivery/errand task${m.length > 1 ? "s" : ""}</strong> for you 🛵<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No delivery gigs live right now, ${userName}. But tutoring and tech tasks are hot! Want me to show those instead?`;
        }

      } else if (has("tutor","teach","study","explain","coach","doubt","academic","notes","lecture")) {
        const m = jobsSummary.filter(j => ["tutor","academic","teach","notes","coaching"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Here are the <strong>tutoring & academic gigs</strong> available 📖<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
          reply += `Great for top-scorers who want to earn while helping peers! 🏆`;
        } else {
          reply = `No tutoring gigs live right now, ${userName}. Exam season is when they spike — check the <a href="/homes" style="color:#6366f1;font-weight:700">marketplace</a> for all categories!`;
        }

      } else if (has("print","photocopy","xerox","stationery","copy","handout")) {
        const m = jobsSummary.filter(j => ["print","stationery","photocopy","xerox","paper","copy"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found some printing-related tasks 🖨️<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No printing tasks live right now, ${userName}. Errand-type tasks that include stationery runs do pop up often. Want me to check those?`;
        }

      } else if (has("code","coding","program","develop","bug","debug","website","software","app","tech")) {
        const m = jobsSummary.filter(j => ["code","software","app","website","tech","program","debug"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Coding tasks pay the best! 💻 Here's what I found:<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
          reply += `Make sure your profile has your tech stack listed to stand out!`;
        } else {
          reply = `No coding gigs live right now, ${userName}. They're highly sought after — keep your profile updated with tech skills and check back soon! 🔧`;
        }

      } else if (has("design","poster","graphic","logo","banner","canva","figma","creative")) {
        const m = jobsSummary.filter(j => ["design","graphic","poster","logo","banner","creative"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found some creative / design gigs 🎨<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No design gigs live right now. They come up around college fests! Add "Designing" to your skills so hosts can find you directly, ${userName}. ✨`;
        }

      } else if (has("pay","earn","money","reward","cash","wallet","transfer","income","price","rate","salary")) {
        const maxReward = jobsSummary.length > 0 ? Math.max(...jobsSummary.map(j => j.price)) : "—";
        reply = `Here's exactly how earnings work 💰<br><br>
<strong>Step 1:</strong> Browse and apply for a task you like.<br>
<strong>Step 2:</strong> Host accepts your application — you start work!<br>
<strong>Step 3:</strong> Complete the task and ask the host to mark it <em>Complete</em>.<br>
<strong>Step 4:</strong> Reward is instantly released to you 🎉<br><br>
<em>Top reward on campus right now: <strong>₹${maxReward}</strong></em> on a single task!`;

      } else if (has("profile","skill","bio","setup","account","improve","hire","hired")) {
        const skillStr = userSkills.length > 0 ? userSkills.join(", ") : "none set yet";
        reply = `Your profile is your resume here, ${userName}! ✨<br><br>
<strong>Your skills right now:</strong> ${skillStr}<br><br>
💡 <strong>Tips to get hired faster:</strong><br>
• Add specific skills: <em>Tutoring, Delivery, Coding, Designing</em><br>
• Write a clear bio about your availability & strengths<br>
• Set a realistic expected price (₹50–₹200 is the sweet spot)<br>
• Enter your campus location so nearby hosts find you first<br><br>
<a href="/profile" style="color:#6366f1;font-weight:700">→ Update your profile now</a>`;

      } else if (has("match","recommend","suggest","smart","best for me","suitable","ai")) {
        if (userSkills.length === 0) {
          reply = `${userName}, your profile doesn't have any skills set yet! Head to your <a href="/profile" style="color:#6366f1;font-weight:700">profile</a> to add skills like Tutoring, Coding, or Delivery — then I'll show perfect matches! 🎯`;
        } else {
          const skillWords = userSkills.map(s => s.toLowerCase());
          const matched = jobsSummary.filter(j => {
            const text = (j.name + " " + j.type + " " + j.description).toLowerCase();
            return skillWords.some(s => text.includes(s));
          });
          if (matched.length > 0) {
            reply = `Based on your skills (<em>${userSkills.join(", ")}</em>), here are your best matches 🎯<br><br>`;
            matched.slice(0, 3).forEach(j => { reply += card(j) + "<br>"; });
            reply += `Or see full AI analysis on your <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches page</a>!`;
          } else {
            reply = `No exact matches for your skills right now, ${userName}. New tasks are added daily! Try the <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches</a> page for a full AI scan. 🔬`;
          }
        }

      } else if (has("library","lib","read","book","study room")) {
        reply = `📚 Campus Library Schedule:<br><br>
<strong>Mon – Fri:</strong> 8:00 AM – 10:00 PM<br>
<strong>Sat – Sun:</strong> 10:00 AM – 6:00 PM<br>
<strong>Basement Study Zone:</strong> Open 24/7 with student ID 🌙<br><br>
<em>Pro tip:</em> The library is peak demand for tutors during exams — post a task or add tutoring to your skills! 📌`;

      } else if (has("cafeteria","canteen","food","eat","lunch","dinner","mess","menu","hungry")) {
        const specials = ["Biryani + Raita","Paneer Butter Masala + Naan","Veg Thali (Full)","Chole Bhature","South Indian Combo"];
        const today = specials[new Date().getDay() % specials.length];
        reply = `🍽️ Today's Cafeteria Special: <strong>${today}</strong><br><br>
<strong>Central Dining Court:</strong> 8:00 AM – 9:30 PM<br>
<strong>Quick Bites Kiosk (Block B):</strong> 7:00 AM – 11:00 PM<br>
<strong>Tea & Snack Counter:</strong> Open all day ☕<br><br>
<em>Fun fact:</em> Cafeteria-to-dorm food deliveries are one of the most popular tasks on this portal! 🛵`;

      } else if (has("safe","trust","scam","fraud","verify","report","rating","secure")) {
        reply = `Safety is our top priority 🛡️<br><br>
<strong>Trust Score:</strong> Every task and user has a verified rating visible on all listings.<br><br>
<strong>Safe practices:</strong><br>
• Meet in public campus areas for in-person tasks<br>
• Communicate through the platform, not personal numbers<br>
• Never pay money upfront — rewards flow <em>to you</em>, not away<br>
• Report suspicious activity via the contact form<br><br>
Build your trust score by completing tasks & getting host reviews ⭐`;

      } else if (has("how","start","begin","use","first time","new","signup")) {
        reply = `Welcome, ${userName}! Here's how it works 🎓<br><br>
<strong>1. Browse</strong> → <a href="/homes" style="color:#6366f1;font-weight:700">Marketplace</a> to explore live gigs<br>
<strong>2. Apply</strong> → Click Apply, pick dates & team size<br>
<strong>3. Get Selected</strong> → Host reviews your profile and picks the best fit<br>
<strong>4. Complete & Get Paid</strong> → Finish the task, host marks done, you get paid! 💸<br><br>
<em>Tip:</em> Fill your <a href="/profile" style="color:#6366f1;font-weight:700">profile & skills</a> first to stand out! 🌟`;

      } else if (has("highest","top pay","best pay","most pay","expensive","best gig","top earn")) {
        const top5 = [...jobsSummary].sort((a,b) => b.price - a.price).slice(0,4);
        if (top5.length === 0) {
          reply = `No tasks live right now, ${userName}. Check back soon! 🔍`;
        } else {
          reply = `💰 <strong>Highest-Paying Tasks on Campus</strong> right now:<br><br>`;
          top5.forEach(j => { reply += card(j) + '<br>'; });
          reply += `<a href="/homes" style="color:#6366f1;font-weight:700">→ See all tasks & apply</a>`;
        }

      } else if (has("latest","newest","recent","just posted","new task","new gig")) {
        const recent = jobsSummary.slice(-4).reverse();
        if (recent.length === 0) {
          reply = `No new tasks posted yet today, ${userName}. Check the <a href="/homes" style="color:#6366f1;font-weight:700">marketplace</a> for updates! 🔄`;
        } else {
          reply = `🆕 <strong>Latest Tasks Posted</strong>:<br><br>`;
          recent.forEach(j => { reply += card(j) + '<br>'; });
        }

      } else if (has("my application","my booking","applied","my task","my status","application status")) {
        if (!req.session?.user) {
          reply = `Please <a href="/login" style="color:#6366f1;font-weight:700">log in</a> to see your applications, ${userName}!`;
        } else if (userBookings.length === 0) {
          reply = `You haven't applied to any tasks yet, ${userName}! Browse the <a href="/homes" style="color:#6366f1;font-weight:700">marketplace</a> and apply to your first gig 🚀`;
        } else {
          const selected = userBookings.filter(b => b.status === 'Selected');
          const applied  = userBookings.filter(b => b.status === 'Applied');
          reply = `📋 <strong>Your Application Summary</strong>, ${userName}:<br><br>`;
          reply += `🟢 <strong>Selected (Hired):</strong> ${selected.length} task${selected.length!==1?'s':''}<br>`;
          reply += `🔵 <strong>Pending Review:</strong> ${applied.length} task${applied.length!==1?'s':''}<br>`;
          reply += `📦 <strong>Total Applied:</strong> ${userBookings.length}<br><br>`;
          if (selected.length > 0) {
            reply += `🎉 You're hired for: <em>${selected.map(b=>b.home?.houseName||'a task').join(', ')}</em>!<br>`;
          }
          reply += `<a href="/bookings" style="color:#6366f1;font-weight:700">→ View full My Applications page</a>`;
        }

      } else if (has("skill gap","what skill","should learn","improve skill","missing skill","need skill","what to add")) {
        const userSkillsLower = (req.session?.user?.skills || []).map(s => s.toLowerCase());
        const taskCategories = [...new Set(jobsSummary.map(j => j.type.toLowerCase()))];
        const catCounts = {};
        jobsSummary.forEach(j => { catCounts[j.type] = (catCounts[j.type]||0)+1; });
        const sorted = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
        const topCats = sorted.slice(0,3).map(([cat]) => cat);
        const gaps = topCats.filter(c => !userSkillsLower.some(s => c.includes(s) || s.includes(c)));
        if (gaps.length === 0) {
          reply = `You're well-covered, ${userName}! 🎯 Your skills already align with the top task categories on campus. Keep your profile updated and check <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches</a>!`;
        } else {
          reply = `📊 <strong>Skill Gap Analysis</strong> for ${userName}:<br><br>`;
          reply += `🔥 <strong>Top in-demand categories right now:</strong> ${sorted.slice(0,3).map(([c,n])=>`${c} (${n} jobs)`).join(', ')}<br><br>`;
          reply += `💡 <strong>Skills to consider adding:</strong> <em>${gaps.join(', ')}</em><br><br>`;
          reply += `Adding these to your profile will help the AI match you to more jobs! <a href="/profile" style="color:#6366f1;font-weight:700">→ Update Skills</a>`;
        }

      } else if (has("category","breakdown","type of task","what kind","categories","job type")) {
        if (jobsSummary.length === 0) {
          reply = `No tasks live right now. Check back soon! 🔄`;
        } else {
          const counts = {};
          jobsSummary.forEach(j => { counts[j.type] = (counts[j.type]||0)+1; });
          const sorted2 = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
          reply = `📊 <strong>Live Task Breakdown by Category:</strong><br><br>`;
          sorted2.forEach(([cat, count]) => {
            const pct = Math.round((count/jobsSummary.length)*100);
            reply += `🔹 <strong>${cat}</strong>: ${count} task${count>1?'s':''} (${pct}%)<br>`;
          });
          reply += `<br><a href="/homes" style="color:#6366f1;font-weight:700">→ Browse all categories</a>`;
        }

      } else if (has("my earning","how much earned","total earned","earned so far","income so far")) {
        const done = req.session?.user?.completedTasks || 0;
        const avgPrice = jobsSummary.length > 0 ? Math.round(jobsSummary.reduce((a,j)=>a+j.price,0)/jobsSummary.length) : 150;
        const est = done * avgPrice;
        if (done === 0) {
          reply = `You haven't completed any tasks yet, ${userName}. Apply to your first gig and start earning! 💸<br><br><a href="/homes" style="color:#6366f1;font-weight:700">→ Browse Tasks</a>`;
        } else {
          reply = `🏆 <strong>Your Earnings Summary</strong>, ${userName}:<br><br>`;
          reply += `✅ <strong>Tasks Completed:</strong> ${done}<br>`;
          reply += `💰 <strong>Estimated Total Earned:</strong> ~₹${est} (based on avg task rate of ₹${avgPrice})<br>`;
          reply += `📈 <strong>Avg per Task:</strong> ~₹${avgPrice}<br><br>`;
          reply += `Keep going — each completed task also boosts your <strong>Trust Score</strong>! ⭐`;
        }

      } else if (has("profile score","profile complete","my profile","how is my profile","profile status")) {
        const u = req.session?.user;
        if (!u) {
          reply = `Please log in to check your profile, ${userName}!`;
        } else {
          let score = 0;
          const checks = [
            { label: 'Name set', done: !!(u.firstName) },
            { label: 'Bio written', done: !!(u.bio && u.bio.length > 10) },
            { label: 'Skills added', done: !!(u.skills && u.skills.length > 0) },
            { label: 'Location set', done: !!(u.location && u.location.length > 2) },
            { label: 'Expected rate set', done: u.expectedPrice > 0 },
            { label: 'Tasks completed', done: u.completedTasks > 0 },
          ];
          checks.forEach(c => { if(c.done) score += 17; });
          score = Math.min(score, 100);
          const bar = '█'.repeat(Math.round(score/10)) + '░'.repeat(10-Math.round(score/10));
          reply = `👤 <strong>Profile Completion: ${score}%</strong><br><code>${bar}</code><br><br>`;
          checks.forEach(c => { reply += `${c.done ? '✅' : '⬜'} ${c.label}<br>`; });
          if (score < 100) reply += `<br><a href="/profile" style="color:#6366f1;font-weight:700">→ Complete your profile to get better matches!</a>`;
          else reply += `<br>🎉 Profile complete! Check your <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches</a>!`;
        }

      } else if (has("how many","count","total","stat","number","how much")) {
        const totalJobs = jobsSummary.length;
        const totalPool = jobsSummary.reduce((a, j) => a + (j.price || 0), 0);
        const avg = totalJobs > 0 ? Math.round(totalPool / totalJobs) : 0;
        reply = `📊 Live Platform Stats:<br><br>
🏷️ <strong>Active Listings:</strong> ${totalJobs} tasks<br>
💰 <strong>Total Reward Pool:</strong> ₹${totalPool}<br>
📈 <strong>Avg Reward per Task:</strong> ₹${avg}<br>
⭐ <strong>Platform Trust Score:</strong> 4.9 / 5<br><br>
New tasks are added every day — stay active to catch them first! 🚀`;

      } else if (has("exam","test","semester","marks","result","grade")) {
        reply = `Exam survival mode activated! 📝<br><br>
<strong>Earn while you study — tips:</strong><br>
• Take <em>note-taking or proofreading tasks</em> — you revise and earn simultaneously!<br>
• Avoid physical tasks during exam week — protect your schedule<br>
• <em>Tutoring</em> is peak-demand before exams — your knowledge is worth ₹200+/hour!<br><br>
Want me to find tutoring gigs you can pick up during exam prep? 🎯`;

      } else if (has("thank","thanks","thx","great","awesome","perfect","nice","cool","helpful","good")) {
        const tys = [
          `You're welcome, ${userName}! 😊 Ask me about live tasks, your skill gap, earnings, or profile score anytime!`,
          `Happy to help! 🎉 I'm connected to live DB — ask me anything: highest-paying tasks, my applications, category stats…`,
          `Glad that helped, ${userName}! 🙌 Try: "Show my applications", "Skill gap analysis", or "Highest paying tasks"!`,
        ];
        reply = tys[Math.floor(Math.random() * tys.length)];


      // ── GENERAL KNOWLEDGE ────────────────────────────────────────────────

      } else if (has("newton","law of motion","force","gravity","inertia","thermodynamics","velocity","acceleration","kinetic","potential energy")) {
        reply = `⚛️ <strong>Physics Quick Notes</strong><br><br>
<strong>Newton's Laws:</strong><br>
• <em>1st (Inertia):</em> An object stays at rest or in motion unless acted upon by a force.<br>
• <em>2nd (F=ma):</em> Force = Mass × Acceleration.<br>
• <em>3rd (Action-Reaction):</em> Every action has an equal and opposite reaction.<br><br>
<strong>Energy:</strong> KE = ½mv² &nbsp;|&nbsp; PE = mgh<br><br>
💡 <em>Tip:</em> Understanding these helps in Engineering, Physics & even designing campus tasks! 🚀`;

      } else if (has("dna","gene","cell","biology","evolution","photosynthesis","mitosis","chromosome","protein","organism")) {
        reply = `🧬 <strong>Biology Quick Notes</strong><br><br>
• <strong>DNA</strong> = Deoxyribonucleic Acid — carries genetic instructions in all living things.<br>
• <strong>Photosynthesis:</strong> 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂ (plants make food!)<br>
• <strong>Mitosis</strong> = cell division producing identical daughter cells (growth & repair).<br>
• <strong>Meiosis</strong> = division producing sex cells (4 unique cells, half chromosomes).<br>
• <strong>Evolution</strong> = species change over time via natural selection (Darwin).<br><br>
Ask me about a specific topic for more details, ${userName}! 🔬`;

      } else if (has("chemistry","element","periodic","acid","base","bond","molecule","reaction","atom","compound","ph")) {
        reply = `🧪 <strong>Chemistry Quick Notes</strong><br><br>
• <strong>Atomic number</strong> = number of protons in an atom.<br>
• <strong>pH scale:</strong> 0–6 = Acid | 7 = Neutral | 8–14 = Base.<br>
• <strong>Bonds:</strong> Ionic (metal + non-metal) | Covalent (non-metals sharing electrons).<br>
• <strong>Common reactions:</strong> Combustion, Neutralisation, Oxidation, Reduction.<br>
• <strong>Periodic Table periods</strong> = rows (same number of shells); groups = columns (same valence electrons).<br><br>
Which topic do you need deeper help with, ${userName}? ⚗️`;

      } else if (has("calculus","derivative","integral","differentiation","integration","algebra","equation","matrix","statistics","probability","formula","theorem","geometry","trigonometry")) {
        reply = `📐 <strong>Math Quick Reference</strong><br><br>
<strong>Derivatives (Differentiation):</strong><br>
• d/dx(xⁿ) = nxⁿ⁻¹ &nbsp;|&nbsp; d/dx(sin x) = cos x &nbsp;|&nbsp; d/dx(eˣ) = eˣ<br><br>
<strong>Integration:</strong><br>
• ∫xⁿ dx = xⁿ⁺¹/(n+1) + C &nbsp;|&nbsp; ∫sin x dx = −cos x + C<br><br>
<strong>Probability:</strong> P(A) = Favourable / Total outcomes<br>
<strong>Statistics:</strong> Mean = Σx/n &nbsp;|&nbsp; Variance = Σ(x−x̄)²/n<br><br>
Need help with a specific problem, ${userName}? Just describe it! 🎯`;

      } else if (has("capital of","largest country","smallest country","longest river","highest mountain","ocean","continent","geography","country","population")) {
        const geoFacts = [
          `🗺️ <strong>Geography Facts</strong><br><br>• <strong>Largest country:</strong> Russia (17M km²)<br>• <strong>Smallest country:</strong> Vatican City<br>• <strong>Longest river:</strong> Nile (Africa)<br>• <strong>Highest mountain:</strong> Mt. Everest (8,849 m)<br>• <strong>Most populous country:</strong> India 🇮🇳<br>• <strong>Capital of France:</strong> Paris | <strong>Japan:</strong> Tokyo | <strong>India:</strong> New Delhi<br>• <strong>Oceans:</strong> Pacific, Atlantic, Indian, Southern, Arctic<br><br>Ask me a specific geography question, ${userName}! 🌍`,
        ];
        reply = geoFacts[0];

      } else if (has("independence","freedom","gandhi","nehru","british","partition","mughal","revolt","1857","1947","constitution","ambedkar","history","ancient","medieval","modern")) {
        reply = `🏛️ <strong>Indian History Quick Notes</strong><br><br>
• <strong>1757:</strong> Battle of Plassey — British began to dominate India.<br>
• <strong>1857:</strong> First War of Independence (Sepoy Mutiny).<br>
• <strong>1885:</strong> Indian National Congress founded.<br>
• <strong>1919:</strong> Jallianwala Bagh Massacre.<br>
• <strong>1942:</strong> Quit India Movement launched by Gandhi.<br>
• <strong>15 Aug 1947:</strong> India's Independence from British rule.<br>
• <strong>26 Jan 1950:</strong> Constitution of India came into effect (Republic Day).<br>
• <strong>Dr. B.R. Ambedkar</strong> — chief architect of the Indian Constitution.<br><br>
Which era or event do you want to explore more, ${userName}? 📚`;

      } else if (has("world war","ww1","ww2","cold war","french revolution","american independence","napoleon","hitler","holocaust","united nations")) {
        reply = `⚔️ <strong>World History Highlights</strong><br><br>
• <strong>WW1 (1914–18):</strong> Triggered by assassination of Archduke Franz Ferdinand; 4 empires collapsed.<br>
• <strong>WW2 (1939–45):</strong> Hitler's Nazi Germany vs. Allied powers; ended with atomic bombs on Japan.<br>
• <strong>Cold War (1947–91):</strong> USA vs. USSR — an ideological battle without direct combat.<br>
• <strong>French Revolution (1789):</strong> "Liberty, Equality, Fraternity" — overthrew the monarchy.<br>
• <strong>United Nations</strong> founded in 1945 to promote peace and cooperation.<br><br>
Want a deeper dive into any specific event, ${userName}? 🌐`;

      } else if (has("oop","object oriented","class","object","inheritance","polymorphism","encapsulation","abstraction","recursion","algorithm","data structure","api","database","sql","http","tcp","ip","binary","bit","byte")) {
        reply = `💻 <strong>CS / Coding Concepts</strong><br><br>
<strong>OOP Pillars:</strong><br>
• <strong>Encapsulation</strong> — bundling data & methods together, hiding internal state.<br>
• <strong>Inheritance</strong> — a class inherits properties from a parent class.<br>
• <strong>Polymorphism</strong> — same method behaves differently in different classes.<br>
• <strong>Abstraction</strong> — hiding complexity, showing only essentials.<br><br>
<strong>Recursion:</strong> A function calling itself with a base case to stop. (e.g. factorial, Fibonacci)<br>
<strong>API:</strong> Application Programming Interface — lets apps talk to each other.<br>
<strong>SQL:</strong> Structured Query Language for databases — SELECT, INSERT, UPDATE, DELETE.<br>
<strong>HTTP:</strong> Protocol for web communication; HTTPS adds encryption (SSL/TLS).<br><br>
Which concept needs more explanation, ${userName}? 🖥️`;

      } else if (has("artificial intelligence","machine learning","deep learning","neural network","nlp","what is ai","what is ml","what is data science","big data")) {
        reply = `🤖 <strong>AI / ML Explained Simply</strong><br><br>
• <strong>AI (Artificial Intelligence)</strong> — making machines simulate human thinking.<br>
• <strong>Machine Learning (ML)</strong> — AI that learns patterns from data without being explicitly programmed.<br>
• <strong>Deep Learning</strong> — ML using multi-layer neural networks (mimics the human brain).<br>
• <strong>NLP (Natural Language Processing)</strong> — AI understanding human language (like me! 😄)<br>
• <strong>Data Science</strong> — extracting insights from large datasets using stats + ML.<br><br>
🔥 <em>Fun fact:</em> I'm a rule-based NLP engine right now — but with OpenAI, I become a full LLM chatbot!<br><br>
Interested in AI as a career, ${userName}? Ask me for tips! 🎯`;

      } else if (has("resume","cv","cover letter","interview","linkedin","internship","placement","job hunt","career","hr","soft skill")) {
        reply = `📄 <strong>Career & Job Hunt Tips</strong><br><br>
<strong>Resume:</strong><br>
• Keep it to 1 page (freshers) — clean, no photos (unless design role).<br>
• Lead with Skills, Projects, then Education — recruiters scan fast!<br>
• Quantify achievements: "Increased sales by 30%" beats "managed sales".<br><br>
<strong>Interview:</strong><br>
• Use the <strong>STAR method</strong>: Situation → Task → Action → Result.<br>
• Research the company before the interview — always.<br>
• Prepare 2–3 smart questions to ask the interviewer.<br><br>
<strong>LinkedIn:</strong> Complete your profile (photo, headline, about section) — recruiters search keywords!<br><br>
Want a mock interview tip or resume review help, ${userName}? 💼`;

      } else if (has("sleep","stress","anxiety","mental health","meditation","productivity","focus","study tip","concentration","burn out","burnout","wellness","health tip","diet","nutrition","exercise","fitness")) {
        reply = `💚 <strong>Student Wellness Tips</strong><br><br>
<strong>Study smarter:</strong><br>
• Use the <strong>Pomodoro Technique</strong>: 25 min focus → 5 min break.<br>
• Active recall > passive reading — test yourself after each topic.<br>
• Sleep 7–8 hours — memory consolidates during sleep! 🌙<br><br>
<strong>Stress management:</strong><br>
• Take 5 deep breaths when overwhelmed (activates parasympathetic nervous system).<br>
• Exercise for 20 min/day — dopamine boost, guaranteed mood lift.<br>
• Talk to someone you trust — isolation worsens stress.<br><br>
<strong>Nutrition:</strong> Stay hydrated 💧 | Limit caffeine after 2 PM | Eat brain food: nuts, berries, eggs.<br><br>
You've got this, ${userName}! 💪 Need more campus-specific tips?`;

      } else if (has("motivat","inspire","quote","give me a quote","feel like giving up","discouraged","demotivate","low","tired","stressed")) {
        const quotes = [
          `🌟 <em>"Success is not final, failure is not fatal: It is the courage to continue that counts."</em> — Winston Churchill<br><br>Every expert was once a beginner, ${userName}. Keep going! 💪`,
          `🔥 <em>"The secret of getting ahead is getting started."</em> — Mark Twain<br><br>You're already here, which means you're already ahead. Take one small step today, ${userName}!`,
          `🎯 <em>"It does not matter how slowly you go as long as you do not stop."</em> — Confucius<br><br>Progress is progress, ${userName}. Consistency beats intensity every time! 🚀`,
          `💡 <em>"Education is the most powerful weapon which you can use to change the world."</em> — Nelson Mandela<br><br>Keep learning, keep growing, ${userName}! Your future self will thank you. ✨`,
        ];
        reply = quotes[Math.floor(Math.random() * quotes.length)];

      } else if (has("who is","who was","who invented","who discovered","who founded","who wrote","who created","famous person","scientist","inventor","president","prime minister","ceo")) {
        reply = `🔍 <strong>Famous Personalities — Quick Facts</strong><br><br>
• <strong>Albert Einstein</strong> — Theory of Relativity; E=mc²<br>
• <strong>Isaac Newton</strong> — Laws of Motion, Law of Gravitation<br>
• <strong>Marie Curie</strong> — First woman to win Nobel Prize (Physics & Chemistry)<br>
• <strong>Nikola Tesla</strong> — AC electricity, radio waves<br>
• <strong>APJ Abdul Kalam</strong> — "Missile Man of India", 11th President of India<br>
• <strong>Elon Musk</strong> — Founded Tesla, SpaceX; CEO of X<br>
• <strong>Sundar Pichai</strong> — CEO of Google & Alphabet<br>
• <strong>Mahatma Gandhi</strong> — Led India's non-violent independence movement<br><br>
Ask me about a specific person for a deeper answer, ${userName}! 🌟`;

      } else if (has("gk","general knowledge","quiz","trivia","fact","did you know","fun fact","random fact")) {
        const gkFacts = [
          `🧠 <strong>Fun GK Facts!</strong><br><br>• The human brain has ~86 billion neurons.<br>• Honey never spoils — 3000-year-old honey found in Egyptian tombs was still edible!<br>• A day on Venus is longer than its year.<br>• India has the most vegetarians in the world (~40%).<br>• The internet was invented by Tim Berners-Lee in 1989.<br>• Octopuses have 3 hearts and blue blood!<br><br>Want a campus GK quiz or specific topic, ${userName}? 🎯`,
          `🌍 <strong>Did You Know?</strong><br><br>• The Great Wall of China is NOT visible from space (common myth!).<br>• Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.<br>• The world's smallest country is Vatican City (0.44 km²).<br>• Light takes 8 minutes 20 seconds to travel from the Sun to Earth.<br>• Sanskrit is considered the mother of many modern languages.<br><br>Ask me any topic — History, Science, Tech, Career! 🤖`,
        ];
        reply = gkFacts[Math.floor(Math.random() * gkFacts.length)];

      } else if (has("internet","network","wifi","tcp","protocol","router","bandwidth","cloud","server","cybersecurity","hacking","encryption","vpn")) {
        reply = `🌐 <strong>Internet & Networking Basics</strong><br><br>
• <strong>Internet</strong> — global network of networks communicating via TCP/IP protocols.<br>
• <strong>TCP/IP:</strong> TCP ensures reliable data delivery; IP handles addressing & routing.<br>
• <strong>HTTP/HTTPS:</strong> Protocol for web pages; HTTPS uses SSL/TLS encryption.<br>
• <strong>DNS:</strong> Domain Name System — translates domain names to IP addresses.<br>
• <strong>Cloud:</strong> Remote servers storing data/running apps (AWS, Azure, Google Cloud).<br>
• <strong>Cybersecurity tips:</strong> Use strong passwords, enable 2FA, avoid public WiFi for sensitive tasks.<br>
• <strong>VPN:</strong> Encrypts your traffic and hides your IP — great for privacy.<br><br>
Interested in cybersecurity as a career path, ${userName}? 🔐`;

      } else if (has("environment","climate","global warming","carbon","pollution","renewable","solar","wind energy","sustainability","biodiversity","ecosystem","ozone")) {
        reply = `🌱 <strong>Environment & Climate</strong><br><br>
• <strong>Global Warming:</strong> Rise in Earth's avg temperature due to greenhouse gases (CO₂, CH₄, N₂O).<br>
• <strong>Greenhouse Effect:</strong> Gases trap heat — essential naturally, harmful in excess.<br>
• <strong>Ozone Layer:</strong> Absorbs UV radiation; depleted by CFCs (now banned via Montreal Protocol).<br>
• <strong>Renewable Energy:</strong> Solar ☀️, Wind 💨, Hydro 💧 — clean alternatives to fossil fuels.<br>
• <strong>Biodiversity:</strong> Variety of life on Earth — habitat destruction is the #1 threat.<br>
• <strong>SDGs:</strong> UN's 17 Sustainable Development Goals for 2030 target climate, poverty & equality.<br><br>
Every small action counts, ${userName}! ♻️`;

      } else if (has("what is","define","explain","meaning of","difference between","how does","why is","when did","where is")) {
        reply = `🤔 That's a great question, ${userName}! I'm happy to help — could you be a bit more specific?<br><br>
Here's what I can explain in depth:<br>
• <strong>Science & Tech</strong> — Physics, Biology, Chemistry, AI, Coding<br>
• <strong>History</strong> — Indian & World history, famous events<br>
• <strong>Geography</strong> — countries, capitals, rivers, mountains<br>
• <strong>Career</strong> — resume tips, interview prep, LinkedIn<br>
• <strong>Health</strong> — study habits, stress, nutrition<br>
• <strong>Campus tasks</strong> — live gigs, payments, smart matching<br><br>
Just ask your specific question! ⚡`;

      } else {
        const defaults = [
          `Hmm, I didn't quite catch that, ${userName}! I can help with:<br>• 🎯 Live campus tasks & applications<br>• 🧠 General Knowledge — Science, History, GK, Coding<br>• 💼 Career & Resume tips<br>• 💚 Wellness & Study tips<br>• 📚 Library hours, Cafeteria, Campus info<br><br>Try: "What is Newton's law?" or "Give me resume tips" ⚡`,
          `I'm your Campus AI, ${userName}! Ask me anything — job portal stuff OR general knowledge:<br>• "Show live tasks" / "Highest paying tasks"<br>• "What is OOP?" / "Fun GK facts"<br>• "Give me a motivational quote"<br>• "Career tips" / "Sleep and study tips" 🤖`,
          `Not sure about that one, ${userName}! But I know a LOT — campus gigs, science, history, coding, career advice, wellness... Just ask! 🎯`,
        ];
        reply = defaults[Math.floor(Math.random() * defaults.length)];
      }

      return res.json({ reply });
    } // end local NLP block

  } catch (error) {
    console.error("[CampusBot Error]", error.message);
    res.status(500).json({ reply: "Something went wrong — please try again in a moment! 🔄" });
  }
};

// ────────── NEW USER PROFILE CONTROLLERS ──────────

// GET: Student Profile Page
exports.getProfile = async (req, res) => {
  try {
    const User = require("../models/user");
    // Retrieve fresh user info from MongoDB
    const user = await User.findById(req.session.user._id);
    
    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: user,
      successMessage: null,
      errorMessage: null,
    });
  } catch (error) {
    console.error("[getProfile Error]", error);
    res.redirect("/");
  }
};

// POST: Save Profile Bio and Skills
exports.postProfile = async (req, res) => {
  try {
    const User = require("../models/user");
    let { bio, skills, expectedPrice, distance, location } = req.body;

    // Parse skills (handles arrays and comma-separated strings)
    let skillsArray = [];
    if (typeof skills === "string") {
      skillsArray = skills
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(skills)) {
      skillsArray = skills.map((s) => s.trim()).filter((s) => s.length > 0);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.session.user._id,
      { 
        bio: bio || "", 
        skills: skillsArray,
        expectedPrice: expectedPrice ? Number(expectedPrice) : 0,
        distance: distance ? Number(distance) : 0,
        location: location ? location.trim() : ""
      },
      { new: true }
    );

    // Sync session
    req.session.user = updatedUser;
    await req.session.save();

    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: updatedUser,
      successMessage: "Profile updated successfully! Now explore your 🎯 Smart Matches.",
      errorMessage: null,
    });
  } catch (error) {
    console.error("[postProfile Error]", error);
    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: req.session.user,
      successMessage: null,
      errorMessage: "An error occurred while saving your profile. Please try again.",
    });
  }
};

// ────────── NEW SMART MATCHING CONTROLLER ──────────

// Local NLP Fallback Engine — robust stem + synonym + price + distance matching
function localMatchEngine(user, jobs) {
  const userSkills = (user.skills || []).map((s) => s.toLowerCase().trim());
  const userBio = (user.bio || "").toLowerCase();
  const userPrice = Number(user.expectedPrice) || 0;
  const userDistance = Number(user.distance) || 0;

  // Synonym map: each skill → all keywords that count as a match in job text
  const synonymMap = {
    "printing":      ["print", "photocopy", "xerox", "stationery", "notes", "handout", "paper", "copy"],
    "stationery":    ["print", "stationery", "notes", "photocopy", "xerox", "paper", "shop"],
    "delivery":      ["deliver", "delivery", "pickup", "pick up", "bring", "collect", "drop", "courier", "fetch", "transport", "carry"],
    "errands":       ["errand", "pickup", "collect", "fetch", "bring", "shop", "buy", "get", "run"],
    "tutoring":      ["tutor", "teach", "explain", "help", "study", "lesson", "coach", "guide", "doubt"],
    "note-taking":   ["note", "notes", "write", "transcribe", "summary", "record", "jot"],
    "proofreading":  ["proof", "edit", "grammar", "review", "correct", "check", "revise"],
    "coding":        ["code", "coding", "program", "develop", "debug", "software", "app", "website", "python", "java", "script", "tech"],
    "designing":     ["design", "poster", "graphic", "banner", "logo", "illustrat", "canva", "figma", "ui", "creative", "visual"],
    "photography":   ["photo", "photograph", "camera", "picture", "shoot", "click", "portrait", "image"],
    "event help":    ["event", "setup", "arrange", "organise", "organize", "decor", "manage", "host", "fest"],
    "cleaning":      ["clean", "sweep", "mop", "wash", "tidy", "sanitise", "sanitize", "dust", "scrub"],
  };

  return jobs.map((job) => {
    const title    = (job.houseName    || "").toLowerCase();
    const desc     = (job.description  || "").toLowerCase();
    const category = (job.propertytype || "").toLowerCase();
    const jobText  = `${title} ${desc} ${category}`; // single blob to search

    let score = 0;
    let matchingSkills = [];

    // ── Score each skill against job text ──────────────────────────
    userSkills.forEach((skill) => {
      const keywords = synonymMap[skill] || [skill];
      let matched = false;

      // 1. Synonym keyword match (e.g. "printing" → looks for "print" in job)
      for (const kw of keywords) {
        if (jobText.includes(kw)) {
          score += 40;
          matched = true;
          break;
        }
      }

      // 2. Stem fallback: strip last 2-3 chars (e.g. "printing"→"printi", "delivery"→"delive")
      if (!matched && skill.length >= 5) {
        const stem = skill.substring(0, skill.length - 2);
        if (jobText.includes(stem)) {
          score += 25;
          matched = true;
        }
      }

      // 3. Direct skill name in job text (last resort)
      if (!matched && jobText.includes(skill)) {
        score += 35;
        matched = true;
      }

      if (matched && !matchingSkills.includes(skill)) {
        matchingSkills.push(skill);
      }
    });

    // ── Small bio word boost ────────────────────────────────────────
    userBio.split(/\s+/).filter((w) => w.length > 3).forEach((word) => {
      if (jobText.includes(word)) score += 3;
    });

    // ── Price & Distance Boost/Penalties ────────────────────────────
    let priceReason = "";
    if (userPrice > 0) {
      if (job.price >= userPrice) {
        score += 10;
        priceReason = "Matches your rate expectations! ";
      } else {
        score -= 15;
        priceReason = "Pay is slightly below your expected rate. ";
      }
    }

    let distanceReason = "";
    if (userDistance > 0) {
      const isPhysical = ["cleaning", "delivery", "event help", "errands"].includes(category);
      if (userDistance <= 1.0) {
        score += 5;
        distanceReason = "Very close to you! ";
      } else if (userDistance > 3.0 && isPhysical) {
        score -= 10;
        distanceReason = "Remote location might increase travel effort. ";
      }
    }

    // ── Normalize ───────────────────────────────────────────────────
    let matchScore = Math.min(Math.max(Math.round(score), 10), 98);
    if (matchingSkills.length === 0) matchScore = Math.min(matchScore, 35);

    // ── Generate reason ─────────────────────────────────────────────
    let reason = matchingSkills.length > 0
      ? `Great match! Your skill in ${matchingSkills.map((s) => `'${s}'`).join(" & ")} aligns perfectly with this ${job.propertytype} task. ${priceReason}${distanceReason}You can complete this easily!`
      : `Potential match! This ${job.propertytype} task in ${job.location} may suit your profile. ${priceReason}${distanceReason}`;

    // ── Override: Printing + stationery job → guaranteed top score ──
    const isPrintUser = userSkills.includes("printing") || userSkills.includes("stationery") || userBio.includes("print");
    const isPrintJob  = jobText.includes("print") || jobText.includes("stationery") || jobText.includes("notes") || jobText.includes("photocopy") || jobText.includes("xerox");
    if (isPrintUser && isPrintJob) {
      matchScore = Math.max(matchScore, 95);
      reason = `Top Pick! 🖨️ You have 'Printing' as a skill — perfect for this task! Just visit the stationery shop, get the notes printed, deliver them, and earn your reward. ${priceReason}`;
      if (!matchingSkills.includes("printing")) matchingSkills.push("printing");
    }

    // ── Override: Delivery/errands + delivery job → high score ─────
    const isDeliveryUser = userSkills.includes("delivery") || userSkills.includes("errands") || userBio.includes("deliver");
    const isDeliveryJob  = jobText.includes("deliver") || jobText.includes("pickup") || jobText.includes("fetch") || jobText.includes("bring") || jobText.includes("collect");
    if (isDeliveryUser && isDeliveryJob) {
      matchScore = Math.max(matchScore, 88);
      reason = `Strong Match! 🚴 Your delivery & errand skills are exactly what this task needs. Pick it up and earn! ${priceReason}${distanceReason}`;
      if (!matchingSkills.includes("delivery")) matchingSkills.push("delivery");
    }

    return { jobId: job._id.toString(), matchScore, reason };
  });
}

// GET: Calculate Smart Matches and render recommendations
exports.getSmartMatches = async (req, res) => {
  try {
    const User = require("../models/user");
    const Home = require("../models/home");

    const user = await User.findById(req.session.user._id);
    const activeJobs = await Home.find();

    // Check if profile is complete (needs bio or at least 1 skill)
    if (!user.bio && (!user.skills || user.skills.length === 0)) {
      return res.render("store/smart-matches", {
        pageTitle: "AI Smart Matches",
        currentPage: "smart-matches",
        isLoggedIn: true,
        user: user,
        matches: [],
        profileIncomplete: true,
        aiUsed: false,
      });
    }

    // Filter out jobs owned by the user themselves (but keep legacy jobs that have no owner)
    const otherJobs = activeJobs.filter(
      (job) => !job.owner || job.owner.toString() !== user._id.toString()
    );

    if (otherJobs.length === 0) {
      return res.render("store/smart-matches", {
        pageTitle: "AI Smart Matches",
        currentPage: "smart-matches",
        isLoggedIn: true,
        user: user,
        matches: [],
        profileIncomplete: false,
        aiUsed: false,
      });
    }

    let matchResults = [];
    let aiUsed = false;

    // Trigger OpenAI semantic analysis if API key is active
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().startsWith("sk-")) {
      try {
        const jobsData = otherJobs.map((job) => ({
          id: job._id.toString(),
          title: job.houseName,
          description: job.description || "",
          category: job.propertytype,
          location: job.location,
          price: job.price,
        }));

        const aiPrompt = `
You are the AI Smart Matcher for a Campus Micro-Job Portal.
Analyze the following student's profile (skills, bio, expected hourly rate, and distance from campus center) against a list of active campus micro-jobs.

STUDENT PROFILE:
- Skills: ${JSON.stringify(user.skills)}
- Bio: ${JSON.stringify(user.bio)}
- Expected Rate: ₹${user.expectedPrice || 0}/hr
- Distance from Campus Center: ${user.distance || 0} km

ACTIVE MICRO-JOBS:
${JSON.stringify(jobsData, null, 2)}

TASK:
1. For each micro-job, calculate a Match Score (an integer from 0 to 100) representing how well the student's skills, experience, bio, rate expectations, and campus distance align with the job's title, description, category, pay, and location.
   - If the job pay meets or exceeds their expected rate, and skills match, the match score should be high (85-100%).
   - If the student has the required skills but the pay is significantly below their expected rate, adjust the score lower (e.g. decrease by 15-20 points).
   - If the student resides far from campus center (>3 km) and it is a physical/delivery job, adjust the score lower.
   - If the job is about "printing notes" or "stationery" and they have "printing", "stationery", "errands" or mention a printer in bio, the match score should be extremely high (85-100%).
2. Provide a highly personalized, friendly 1-2 sentence explanation ("reason") in English for why they are a good match, referring to their rate match or distance advantage if relevant. Speak directly to the student. Keep it conversational, encouraging, and under 40 words.

Return ONLY a valid JSON object, containing a single key "matches", which maps to an array of match objects:
{
  "matches": [
    {
      "jobId": "string",
      "matchScore": number,
      "reason": "string"
    }
  ]
}
`;

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional JSON-generating AI system that always produces valid JSON and never wraps it in markdown blocks.",
            },
            { role: "user", content: aiPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 1500,
        });

        const parsedContent = JSON.parse(response.choices[0].message.content);
        if (parsedContent && Array.isArray(parsedContent.matches)) {
          matchResults = parsedContent.matches;
          aiUsed = true;
          console.log("[AI Matching Engine executed successfully]");
        }
      } catch (aiError) {
        console.error("[AI Engine Failed, falling back to local NLP]", aiError?.message || aiError);
      }
    }

    // Trigger local fallback if AI wasn't run or returned empty
    if (matchResults.length === 0) {
      matchResults = localMatchEngine(user, otherJobs);
      aiUsed = false;
      console.log("[Local NLP Fallback Match Engine executed successfully]");
    }

    // Merge match attributes back into original MongoDB document items
    const matchedJobs = otherJobs
      .map((job) => {
        const matchData = matchResults.find(
          (m) => m.jobId === job._id.toString()
        ) || {
          matchScore: 35,
          reason: "Matches general campus micro-job profile parameters.",
        };

        return {
          ...job.toObject(),
          matchScore: matchData.matchScore,
          matchReason: matchData.reason,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by highest score first

    res.render("store/smart-matches", {
      pageTitle: "🎯 Smart Matches",
      currentPage: "smart-matches",
      isLoggedIn: true,
      user: user,
      matches: matchedJobs,
      profileIncomplete: false,
      aiUsed: aiUsed,
    });
  } catch (error) {
    console.error("[getSmartMatches Controller Error]", error);
    res.redirect("/");
  }
};


export const departments = [
  "Computer Science & Engineering",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Electrical Engineering",
  "Food Technology",
  "Architecture",
  "Business Studies",
]

export const programs = [
  "B.Tech Computer Science",
  "B.Tech Electronics",
  "B.Tech Mechanical Engineering",
  "B.Tech Civil Engineering",
  "B.Tech Electrical Engineering",
  "B.Tech Food Technology",
  "B.Arch Architecture",
  "MBA",
]

export const demoProfiles = [
  {
    id: "ayaan-malik",
    name: "Ayaan Malik",
    program: "B.Tech Computer Science",
    department: "Computer Science & Engineering",
    year: "Final Year",
    featured: true,
    bio: "Builds web products and small ML tools for campus and local businesses.",
    about:
      "Ayaan works across frontend and backend, with a growing interest in applied machine learning. He enjoys turning messy campus problems into simple tools students actually use.",
    skills: ["Full Stack Development", "AI/ML", "Python", "React"],
    image:
      "/images/ayaan-malik.jpg",
    projects: [
      {
        title: "CampusRide",
        description: "A shared ride board for students travelling between Awantipora and Srinagar.",
        link: "https://github.com",
      },
      {
        title: "Notes Graph",
        description: "A study assistant that clusters lecture notes by topic using Python.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "zoya-farooq",
    name: "Zoya Farooq",
    program: "B.Tech Electronics",
    department: "Electronics & Communication",
    year: "3rd Year",
    featured: true,
    bio: "Designs calm, usable interfaces for student products and hardware dashboards.",
    about:
      "Zoya sits between electronics and design. She prototypes hardware, then spends just as much time making the interface feel clear. Her work is quiet, structured, and detail-led.",
    skills: ["UI/UX Design", "Figma", "Branding", "Product Design"],
    image:
      "/images/zoya-farooq.jpg",
    projects: [
      {
        title: "Lab Desk",
        description: "A visual system and dashboard UI for electronics lab equipment booking.",
        link: "https://www.figma.com",
      },
      {
        title: "IUST Marks",
        description: "Brand and interface exploration for a student portfolio identity.",
        link: "https://www.figma.com",
      },
    ],
  },
  {
    id: "rayyan-ahmad",
    name: "Rayyan Ahmad",
    program: "B.Tech Mechanical Engineering",
    department: "Mechanical Engineering",
    year: "Final Year",
    featured: true,
    bio: "Designs mechanical systems and small robots with a focus on practical builds.",
    about:
      "Rayyan likes work that leaves the screen. He models parts in CAD, iterates quickly, and collaborates with CS students when a build needs software.",
    skills: ["3D Design", "CAD", "Robotics", "Product Development"],
    image:
      "/images/rayyan-ahmad.jpg",
    projects: [
      {
        title: "Line Follower Mk.3",
        description: "A compact robot built for the campus robotics club competitions.",
        link: "https://github.com",
      },
      {
        title: "Workshop Fixture",
        description: "A 3D-printed jig that reduced setup time for a repeating lab task.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "inaya-shah",
    name: "Inaya Shah",
    program: "B.Tech Computer Science",
    department: "Computer Science & Engineering",
    year: "3rd Year",
    featured: false,
    bio: "Works on data analysis and clean visual stories from campus datasets.",
    about:
      "Inaya is interested in how data can make student life less guesswork — from placement trends to library usage. She writes Python, and cares about charts that stay honest.",
    skills: ["Python", "Data Analysis", "SQL", "Tableau"],
    image:
      "/images/inaya-shah.jpg",
    projects: [
      {
        title: "Placement Pulse",
        description: "A public-facing summary of anonymised placement patterns for CSE.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "hamza-bhat",
    name: "Hamza Bhat",
    program: "B.Tech Civil Engineering",
    department: "Civil Engineering",
    year: "Final Year",
    featured: false,
    bio: "Focuses on structural modelling and site documentation for student projects.",
    about:
      "Hamza enjoys the overlap of drawing, calculation, and fieldwork. He has helped junior teams document studio projects with clearer drawings and site photos.",
    skills: ["AutoCAD", "Structural Analysis", "Revit", "Site Survey"],
    image:
      "/images/hamza-bhat.jpg",
    projects: [
      {
        title: "Studio Bridge Study",
        description: "A small-span pedestrian bridge study with load notes and drawings.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "mehak-qadri",
    name: "Mehak Qadri",
    program: "B.Arch Architecture",
    department: "Architecture",
    year: "4th Year",
    featured: false,
    bio: "Explores campus space, housing, and material studies through drawing and models.",
    about:
      "Mehak’s studio work looks at how students actually use campus edges — canteens, courtyards, and winter circulation. She draws by hand first, then builds digital models.",
    skills: ["Architecture", "Sketching", "Rhino", "Spatial Design"],
    image:
      "/images/mehak-qadri.jpg",
    projects: [
      {
        title: "Winter Court",
        description: "A courtyard proposal that holds sun and wind for late-semester study.",
        link: "https://www.behance.net",
      },
    ],
  },
  {
    id: "faizan-dar",
    name: "Faizan Dar",
    program: "B.Tech Electrical Engineering",
    department: "Electrical Engineering",
    year: "2nd Year",
    featured: false,
    bio: "Builds small power and automation projects, often with Arduino and sensors.",
    about:
      "Faizan is early in the programme but already active in the makerspace. He likes documenting circuits clearly so other students can rebuild them.",
    skills: ["Arduino", "IoT", "Circuit Design", "C++"],
    image:
      "/images/faizan-dar.jpg",
    projects: [
      {
        title: "Hostel Watch",
        description: "A simple energy monitor prototype for a hostel corridor lighting circuit.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "sana-mir",
    name: "Sana Mir",
    program: "MBA",
    department: "Business Studies",
    year: "1st Year",
    featured: false,
    bio: "Looks at student ventures, market research, and early-stage campus businesses.",
    about:
      "Sana came to IUST after working with a Srinagar retail brand. She is interested in helping student builders price, position, and talk about their work without jargon.",
    skills: ["Market Research", "Strategy", "Pitch Decks", "Operations"],
    image:
      "/images/sana-mir.jpg",
    projects: [
      {
        title: "Campus Vendor Map",
        description: "A research brief on student spending around the Awantipora campus.",
        link: "https://www.notion.so",
      },
    ],
  },
  {
    id: "omar-khan",
    name: "Omar Khan",
    program: "B.Tech Computer Science",
    department: "Computer Science & Engineering",
    year: "Final Year",
    featured: false,
    bio: "Works on web security basics, Linux, and careful backend APIs.",
    about:
      "Omar prefers systems that fail loudly and recover cleanly. He has helped classmates review authentication flows and write clearer API docs.",
    skills: ["Cybersecurity", "Linux", "Node.js", "APIs"],
    image:
      "/images/omar-khan.jpg",
    projects: [
      {
        title: "Keycheck",
        description: "A checklist tool that flags common mistakes in student web projects.",
        link: "https://github.com",
      },
    ],
  },
  {
    id: "hiba-naseer",
    name: "Hiba Naseer",
    program: "B.Tech Food Technology",
    department: "Food Technology",
    year: "3rd Year",
    featured: false,
    bio: "Studies food processing and packaging with a side interest in product branding.",
    about:
      "Hiba likes the laboratory side of food technology and the story a product tells on a shelf. She has collaborated with design students on packaging for a class project.",
    skills: ["Food Processing", "Quality Control", "Packaging", "Research"],
    image:
      "/images/hiba-naseer.png",
    projects: [
      {
        title: "Valley Preserve",
        description: "A small-batch preserve concept with process notes and packaging sketches.",
        link: "https://www.behance.net",
      },
    ],
  },
  {
    id: "adil-raina",
    name: "Adil Raina",
    program: "B.Tech Computer Science",
    department: "Computer Science & Engineering",
    year: "2nd Year",
    featured: false,
    bio: "Makes mobile apps and short product demos with React Native.",
    about:
      "Adil is still finding his focus, but he ships small apps quickly. He is looking for collaborators who care about design as much as code.",
    skills: ["React Native", "JavaScript", "Firebase", "UI Design"],
    image:
      "/images/adil-raina.jpg",
    projects: [
      {
        title: "Bus Bell",
        description: "A lightweight timetable app for the IUST campus bus timings.",
        link: "https://github.com",
      },
    ],
  },
]

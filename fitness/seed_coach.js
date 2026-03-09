
import { db } from './src/firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

async function seed() {
    try {
        const coachData = {
            name: "Coach Prem",
            trainerEmail: "premreddy@gmail.com", // Adjust this if you use a different login email
            specialty: "Transformation & Strength",
            experience: "10+ Years",
            bio: "Elite transformation specialist with over a decade of experience in building powerhouse physiques.",
            certifications: ["NSCA Certified", "Precision Nutrition Level 2", "Competitive Bodybuilder"],
            photoURL: "https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&q=80&w=300&h=300",
            rating: 4.9,
            clients: 124,
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'coaches'), coachData);
        console.log("Coach seeded with ID: ", docRef.id);
        process.exit(0);
    } catch (err) {
        console.error("Seed failed:", err);
        process.exit(1);
    }
}

seed();

const textLower = `+91 63624 93246
1. Abhas Kumar Yadav
2. Abhigyan
3. Aditya Chauhan
4. Aditya Jaiswal
5. Akash Kumar
6. Alok Kumar Yadav
7. Ankush Vikash
8. Bibek Kumar Singh
9. Divya`.toLowerCase();

const dateKeywords = ["deadline", "due", "submit", "submission", "tomorrow", "today"];
console.log("date:", dateKeywords.filter(kw => textLower.includes(kw)));

const taskKeywords = ["todo", "action item", "please do", "need to", "make sure", "don't forget", "remember to", "assign"];
console.log("task:", taskKeywords.filter(kw => textLower.includes(kw)));

const decisionKeywords = ["decided", "agreed", "final", "confirmed", "approved", "let's go with"];
console.log("decision:", decisionKeywords.filter(kw => textLower.includes(kw)));

const meetingKeywords = ["meet", "meeting", "zoom", "call", "standup", "sync", "catch up"];
console.log("meeting:", meetingKeywords.filter(kw => textLower.includes(kw)));

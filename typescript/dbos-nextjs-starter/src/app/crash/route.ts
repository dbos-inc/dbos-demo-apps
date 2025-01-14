
export async function GET() {

    console.log("Received request Crashing the app");

    process.exit(1);

}
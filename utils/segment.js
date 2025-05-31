
async function fetchUserTraits(registrantId) {

    const { SEGMENT_WRITE_KEY, SEGMENT_SPACE_ID, SEGMENT_ACCESS_TOKEN } = process.env;

    const segmentAPIUrl = `https://profiles.segment.com/v1/spaces/${SEGMENT_SPACE_ID}/collections/users/profiles/user_id:${registrantId}/traits?limit=200`;
 
    const authToken = Buffer.from(`${SEGMENT_ACCESS_TOKEN}:`).toString('base64');

    try {
        const response = await fetch(segmentAPIUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'identity',
                'Authorization': `Basic ${authToken}`,

            }
        });

        if (!response.ok) {
            console.error('Error fetching data from Segment API:', response.statusText);
            // return new Response('Failed to fetch user traits', { status: 500 });
            return null;
        }

        const data = await response.json();
        console.log('data', data)
        return data.traits;

    } catch (error) {
        console.error('Error fetching data from Segment API:', error);
        // return new Response('Failed to fetch user traits', { status: 500 });
        return null;
    }
}


async function fetchUser(registrantId) {
    console.log('Feching user')

    const { SEGMENT_WRITE_KEY, SEGMENT_SPACE_ID, SEGMENT_ACCESS_TOKEN } = process.env;

    const segmentAPIUrl = `https://profiles.segment.com/v1/spaces/${SEGMENT_SPACE_ID}/collections/users/profiles/user_id:${registrantId}/traits?limit=200`;
 
    const authToken = Buffer.from(`${SEGMENT_ACCESS_TOKEN}:`).toString('base64');

    try {
        const response = await fetch(segmentAPIUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Encoding': 'identity',
                'Authorization': `Basic ${authToken}`,

            }
        });

        if (!response.ok) {
            console.error('Error fetching data from Segment API:', response.statusText);
            // return new Response('Failed to fetch user traits', { status: 500 });
            return null;
        }

        const data = await response.json();
        console.log('data', data)
        return data.traits;

    } catch (error) {
        console.error('Error fetching data from Segment API:', error);
        // return new Response('Failed to fetch user traits', { status: 500 });
        return null;
    }
}

// async function fetchUserTraits(segmentSpaceId, registrantId, segmentAccessToken) {
//     const segmentAPIUrl = `https://profiles.segment.com/v1/spaces/${segmentSpaceId}/collections/users/profiles/user_id:${registrantId}/traits?limit=200`;
//     const axios = require('axios');
//     const authToken = Buffer.from(`${segmentAccessToken}:`).toString('base64');
    
//     const response = await axios.get(segmentAPIUrl, {
//         headers: {
//             'Content-Type': 'application/json',
//             'Authorization': `Basic ${authToken}`,
//             'Accept': 'application/json',
//         }
//     });

//     const data = await response.data;
//     return data.traits;
// }




module.exports = {
    fetchUserTraits,
    fetchUser
};


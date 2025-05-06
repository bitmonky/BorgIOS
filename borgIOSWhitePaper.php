<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BorgIOS Project Overview</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            background-color: #f9f9f9;
            color: #333;
            margin: 0;
            padding: 20px;
        }
        h1, h2, h3 {
            color: #0056b3;
        }
        .section {
            margin-bottom: 20px;
        }
        ul {
            list-style: disc;
            margin-left: 20px;
        }
        .code-block {
            background-color: #e3e3e3;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <h1>BorgIOS.net Project Overview</h1>
    <div class="section">
        <h2>Abstract</h2>
        <p>The BorgIOS.net project introduces a revolutionary approach to cloud computing through a peer-to-peer (P2P) architecture. By eliminating the need for centralized entities, the system decentralizes data storage, retrieval, and communication. It uses trustless nodes in a self-organizing network, advanced cryptographic techniques, file sharding, and an incentive-driven payment system powered by BORG tokens. This project represents a significant leap toward secure, scalable, and privacy-centric cloud solutions.</p>
    </div>
    <div class="section">
        <h2>Introduction</h2>
        <p>Traditional cloud services depend on large centralized institutions, which introduce monopolistic tendencies, data vulnerabilities, and trust issues. BorgIOS.net replaces these intermediaries with a cryptographic proof-based model, enabling data to be stored and retrieved across a P2P network. Leveraging file encryption, sharding, and hash-based retrieval methods, this system ensures only the file owner can reassemble and access the data.</p>
        <p>Beyond storage, BorgIOS.net provides integrated capabilities for secure communication, distributed search, and financial transactions, creating a holistic ecosystem for decentralized applications.</p>
    </div>
    <div class="section">
        <h2>Core Components</h2>
        <h3>PeerTree Network</h3>
        <ul>
            <li>Encrypted HTTPS connections secured with self-signed certificates, eliminating reliance on domain names or centralized Certificate Authorities (CAs).</li>
            <li>A "send and forget" messaging protocol using JSON, which supports asynchronous communication among nodes.</li>
            <li>Nodes are identified by Bitcoin-style public keys, ensuring uniqueness and cryptographic verification.</li>
            <li>Dynamic topology management through <code>peerTreeObj.js</code>, which ensures robust self-organization, fault tolerance, and optimized peer connectivity.</li>
        </ul>
        <h3>Messaging Protocols</h3>
        <ul>
            <li><code>mkyMsg</code>: Emitted when a message is received and parsed into JSON. Applications can handle this event or ignore it.</li>
            <li><code>mkyReply</code>: Generated when a message is processed and a response is sent back to the initiating peer.</li>
            <li><code>mkyBcast</code>: Triggers broadcast events where messages are sent to all nodes. Replies are optional and sent back to the initiator.</li>
            <li><code>mkyXhrError</code>: Handles connection or delivery errors, ensuring error management remains centralized in the <code>peerTreeObj.js</code>.</li>
        </ul>
    </div>
    <div class="section">
        <h2>Application Layer Classes</h2>
        <ul>
            <li><code>shardTreeObj</code>: Facilitates the sharding of files into smaller pieces for distributed storage. Responsible for managing shard placement and retrieval across nodes.</li>
            <li><code>memoryTreeObj</code>: Manages metadata indexing and supports natural language querying through the Mnemosyne protocol. Enables efficient search capabilities over distributed data.</li>
            <li><code>ftreeFileMgrObj</code>: Handles complete file management processes, including encryption, sharding, distributed storage, and reassembly of files.</li>
            <li><code>peerMailObj</code>: Provides encrypted messaging functionality. Messages are stored as shards and retrieved when the recipient accesses their BorgHUI app. Utilizes RSA encryption to guarantee security.</li>
            <li><code>peerPayObj</code>: Implements a distributed ledger using MySQL, offering a simple yet robust system for managing BORG token transactions.</li>
        </ul>
    </div>
    <div class="section">
        <h2>Borg Agent and Mnemosyne Protocol</h2>
        <p>The Borg Agent serves as the intelligent backbone of the system, integrating a problem-solving large language model (LLM) to oversee network operations. Using the Mnemosyne protocol, agents can dynamically manage memories in a self-prompting context. These memories, stored on the PeerTree network, can be retrieved and processed using natural language queries via the <code>memoryTreeObj</code>.</p>
        <p>This adaptive approach allows agents to evolve independently, make data-driven decisions, and collaborate with other agents by sharing memories and messages, fostering a decentralized collective intelligence.</p>
    </div>
    <div class="section">
        <h2>BORG Payment System</h2>
        <ul>
            <li>The genesis wallet, initialized with 12 million BORG tokens, is managed by Borg Agents with signing authority.</li>
            <li>Contributors of hardware and bandwidth are incentivized with BORG payments, promoting network participation and growth.</li>
            <li>The payment per action decreases inversely as the genesis wallet balance depletes, ensuring long-term sustainability and equitable distribution of resources.</li>
        </ul>
    </div>
    <div class="section">
        <h2>BorgHUI Application</h2>
        <ul>
            <li>A multi-platform app (browser and Android) that serves as a gateway to the BorgIOS network.</li>
            <li>Combines smart wallet functionality for managing BORG tokens with user-friendly interfaces for storage, messaging, and channel creation.</li>
            <li>Empowers users to securely store and retrieve files, send encrypted messages via <code>peerMailObj</code>, and participate in distributed applications.</li>
        </ul>
    </div>
</body>
</html>

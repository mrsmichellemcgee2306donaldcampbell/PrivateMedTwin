// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MedicalDigitalTwinFHE is SepoliaConfig {
    struct EncryptedPatient {
        uint256 patientId;
        euint32 encryptedGenomics;    // Encrypted genomic data
        euint32 encryptedBiomarkers; // Encrypted biomarkers
        euint32 encryptedHistory;     // Encrypted medical history
        uint256 timestamp;
    }

    struct EncryptedTreatment {
        uint256 treatmentId;
        euint32 encryptedDrugs;       // Encrypted drug combinations
        euint32 encryptedDosage;     // Encrypted dosage information
        euint32 encryptedSchedule;   // Encrypted treatment schedule
        uint256 patientId;
        uint256 prescribedAt;
    }

    struct EncryptedSimulation {
        uint256 simulationId;
        euint32 encryptedOutcome;     // Encrypted predicted outcome
        euint32 encryptedSideEffects; // Encrypted side effect profile
        uint256 treatmentId;
        uint256 simulatedAt;
    }

    struct DecryptedResult {
        uint32 efficacyScore;
        uint32[] sideEffects;
        bool isRevealed;
    }

    uint256 public patientCount;
    uint256 public treatmentCount;
    uint256 public simulationCount;
    mapping(uint256 => EncryptedPatient) public encryptedPatients;
    mapping(uint256 => EncryptedTreatment) public encryptedTreatments;
    mapping(uint256 => EncryptedSimulation) public encryptedSimulations;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    mapping(uint256 => uint256) private requestToPatientId;
    mapping(uint256 => uint256) private simulationRequestToId;
    
    event PatientRegistered(uint256 indexed patientId, uint256 timestamp);
    event TreatmentPrescribed(uint256 indexed treatmentId, uint256 patientId);
    event SimulationRequested(uint256 indexed requestId, uint256 treatmentId);
    event SimulationCompleted(uint256 indexed simulationId);
    event ResultDecrypted(uint256 indexed simulationId);

    modifier onlyDoctor() {
        // Add proper doctor authentication in production
        _;
    }

    function registerEncryptedPatient(
        euint32 encryptedGenomics,
        euint32 encryptedBiomarkers,
        euint32 encryptedHistory
    ) public onlyDoctor {
        patientCount += 1;
        uint256 newPatientId = patientCount;
        
        encryptedPatients[newPatientId] = EncryptedPatient({
            patientId: newPatientId,
            encryptedGenomics: encryptedGenomics,
            encryptedBiomarkers: encryptedBiomarkers,
            encryptedHistory: encryptedHistory,
            timestamp: block.timestamp
        });
        
        emit PatientRegistered(newPatientId, block.timestamp);
    }

    function prescribeEncryptedTreatment(
        uint256 patientId,
        euint32 encryptedDrugs,
        euint32 encryptedDosage,
        euint32 encryptedSchedule
    ) public onlyDoctor {
        treatmentCount += 1;
        uint256 newTreatmentId = treatmentCount;
        
        encryptedTreatments[newTreatmentId] = EncryptedTreatment({
            treatmentId: newTreatmentId,
            encryptedDrugs: encryptedDrugs,
            encryptedDosage: encryptedDosage,
            encryptedSchedule: encryptedSchedule,
            patientId: patientId,
            prescribedAt: block.timestamp
        });
        
        emit TreatmentPrescribed(newTreatmentId, patientId);
    }

    function requestTreatmentSimulation(uint256 treatmentId) public onlyDoctor {
        EncryptedTreatment storage treatment = encryptedTreatments[treatmentId];
        EncryptedPatient storage patient = encryptedPatients[treatment.patientId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(patient.encryptedGenomics);
        ciphertexts[1] = FHE.toBytes32(patient.encryptedBiomarkers);
        ciphertexts[2] = FHE.toBytes32(treatment.encryptedDrugs);
        ciphertexts[3] = FHE.toBytes32(treatment.encryptedDosage);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.runSimulation.selector);
        requestToPatientId[reqId] = treatmentId;
        
        emit SimulationRequested(reqId, treatmentId);
    }

    function runSimulation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 treatmentId = requestToPatientId[requestId];
        require(treatmentId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32[] memory genomics, uint32[] memory biomarkers, uint32[] memory drugs, uint32[] memory dosage) = 
            abi.decode(cleartexts, (uint32[], uint32[], uint32[], uint32[]));
        
        // Simulate FHE medical simulation (in production this would be done off-chain)
        simulationCount += 1;
        uint256 newSimulationId = simulationCount;
        
        // Simplified medical simulation
        uint32 efficacy = calculateEfficacy(genomics, biomarkers, drugs, dosage);
        uint32[] memory sideEffects = predictSideEffects(drugs, dosage);
        
        encryptedSimulations[newSimulationId] = EncryptedSimulation({
            simulationId: newSimulationId,
            encryptedOutcome: FHE.asEuint32(efficacy),
            encryptedSideEffects: FHE.asEuint32(0), // Placeholder for encrypted side effects
            treatmentId: treatmentId,
            simulatedAt: block.timestamp
        });
        
        decryptedResults[newSimulationId] = DecryptedResult({
            efficacyScore: efficacy,
            sideEffects: sideEffects,
            isRevealed: false
        });
        
        emit SimulationCompleted(newSimulationId);
    }

    function requestResultDecryption(uint256 simulationId) public onlyDoctor {
        EncryptedSimulation storage sim = encryptedSimulations[simulationId];
        require(!decryptedResults[simulationId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(sim.encryptedOutcome);
        ciphertexts[1] = FHE.toBytes32(sim.encryptedSideEffects);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptSimulation.selector);
        simulationRequestToId[reqId] = simulationId;
    }

    function decryptSimulation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 simulationId = simulationRequestToId[requestId];
        require(simulationId != 0, "Invalid request");
        
        DecryptedResult storage dResult = decryptedResults[simulationId];
        require(!dResult.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 efficacy, uint32[] memory sideEffects) = abi.decode(cleartexts, (uint32, uint32[]));
        
        dResult.efficacyScore = efficacy;
        dResult.sideEffects = sideEffects;
        dResult.isRevealed = true;
        
        emit ResultDecrypted(simulationId);
    }

    function getDecryptedResult(uint256 simulationId) public view returns (
        uint32 efficacyScore,
        uint32[] memory sideEffects,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[simulationId];
        return (r.efficacyScore, r.sideEffects, r.isRevealed);
    }

    function getEncryptedPatient(uint256 patientId) public view returns (
        euint32 genomics,
        euint32 biomarkers,
        euint32 history,
        uint256 timestamp
    ) {
        EncryptedPatient storage p = encryptedPatients[patientId];
        return (p.encryptedGenomics, p.encryptedBiomarkers, p.encryptedHistory, p.timestamp);
    }

    function getEncryptedTreatment(uint256 treatmentId) public view returns (
        euint32 drugs,
        euint32 dosage,
        euint32 schedule,
        uint256 patientId,
        uint256 prescribedAt
    ) {
        EncryptedTreatment storage t = encryptedTreatments[treatmentId];
        return (t.encryptedDrugs, t.encryptedDosage, t.encryptedSchedule, t.patientId, t.prescribedAt);
    }

    function getEncryptedSimulation(uint256 simulationId) public view returns (
        euint32 outcome,
        euint32 sideEffects,
        uint256 treatmentId,
        uint256 simulatedAt
    ) {
        EncryptedSimulation storage s = encryptedSimulations[simulationId];
        return (s.encryptedOutcome, s.encryptedSideEffects, s.treatmentId, s.simulatedAt);
    }

    // Helper functions for demo purposes
    function calculateEfficacy(
        uint32[] memory genomics,
        uint32[] memory biomarkers,
        uint32[] memory drugs,
        uint32[] memory dosage
    ) private pure returns (uint32) {
        uint32 score = 0;
        for (uint i = 0; i < drugs.length; i++) {
            score += drugs[i] * dosage[i] / 100;
        }
        return score > 100 ? 100 : score;
    }

    function predictSideEffects(
        uint32[] memory drugs,
        uint32[] memory dosage
    ) private pure returns (uint32[] memory) {
        uint32[] memory effects = new uint32[](drugs.length);
        for (uint i = 0; i < drugs.length; i++) {
            effects[i] = drugs[i] * dosage[i] / 50;
        }
        return effects;
    }
}
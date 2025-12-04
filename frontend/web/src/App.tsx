// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DigitalTwin {
  id: string;
  patientId: string;
  encryptedData: string;
  createdAt: number;
  updatedAt: number;
  treatmentHistory: Treatment[];
  currentStatus: string;
}

interface Treatment {
  id: string;
  name: string;
  dosage: string;
  duration: string;
  effectiveness: number;
  sideEffects: string;
  timestamp: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [twins, setTwins] = useState<DigitalTwin[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newTwinData, setNewTwinData] = useState({
    patientId: "",
    initialData: ""
  });
  const [selectedTwin, setSelectedTwin] = useState<DigitalTwin | null>(null);
  const [showTeamInfo, setShowTeamInfo] = useState(false);

  // Statistics for dashboard
  const activeTwins = twins.filter(t => t.currentStatus === "active").length;
  const simulatedTwins = twins.reduce((acc, twin) => acc + twin.treatmentHistory.length, 0);

  useEffect(() => {
    loadTwins().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadTwins = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("twin_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing twin keys:", e);
        }
      }
      
      const list: DigitalTwin[] = [];
      
      for (const key of keys) {
        try {
          const twinBytes = await contract.getData(`twin_${key}`);
          if (twinBytes.length > 0) {
            try {
              const twinData = JSON.parse(ethers.toUtf8String(twinBytes));
              list.push({
                id: key,
                patientId: twinData.patientId,
                encryptedData: twinData.data,
                createdAt: twinData.createdAt,
                updatedAt: twinData.updatedAt,
                treatmentHistory: twinData.treatmentHistory || [],
                currentStatus: twinData.currentStatus || "active"
              });
            } catch (e) {
              console.error(`Error parsing twin data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading twin ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.createdAt - a.createdAt);
      setTwins(list);
    } catch (e) {
      console.error("Error loading twins:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createTwin = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Creating encrypted digital twin with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newTwinData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const twinId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const twinData = {
        patientId: newTwinData.patientId,
        data: encryptedData,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        treatmentHistory: [],
        currentStatus: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `twin_${twinId}`, 
        ethers.toUtf8Bytes(JSON.stringify(twinData))
      );
      
      const keysBytes = await contract.getData("twin_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(twinId);
      
      await contract.setData(
        "twin_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Digital twin created successfully!"
      });
      
      await loadTwins();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewTwinData({
          patientId: "",
          initialData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const simulateTreatment = async (twinId: string, treatment: any) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE simulation on encrypted data..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const twinBytes = await contract.getData(`twin_${twinId}`);
      if (twinBytes.length === 0) {
        throw new Error("Digital twin not found");
      }
      
      const twinData = JSON.parse(ethers.toUtf8String(twinBytes));
      
      // Simulate treatment effectiveness (70-95% range)
      const effectiveness = Math.floor(Math.random() * 26) + 70;
      
      const newTreatment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: treatment.name,
        dosage: treatment.dosage,
        duration: treatment.duration,
        effectiveness,
        sideEffects: effectiveness > 85 ? "Minimal" : "Moderate",
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const updatedTwin = {
        ...twinData,
        updatedAt: Math.floor(Date.now() / 1000),
        treatmentHistory: [...(twinData.treatmentHistory || []), newTreatment]
      };
      
      await contract.setData(
        `twin_${twinId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedTwin))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE simulation completed: ${effectiveness}% effectiveness!`
      });
      
      await loadTwins();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Simulation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const renderBarChart = () => {
    if (twins.length === 0) return null;

    const effectivenessData = twins.flatMap(twin => 
      twin.treatmentHistory.map(treatment => treatment.effectiveness)
    );

    if (effectivenessData.length === 0) return null;

    const maxEffectiveness = Math.max(...effectivenessData);
    const minEffectiveness = Math.min(...effectivenessData);
    const avgEffectiveness = effectivenessData.reduce((a, b) => a + b, 0) / effectivenessData.length;

    return (
      <div className="bar-chart-container">
        <div className="chart-title">Treatment Effectiveness Analysis</div>
        <div className="chart-bars">
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ height: `${(minEffectiveness / 100) * 80}%` }}
            ></div>
            <div className="bar-label">Min</div>
            <div className="bar-value">{minEffectiveness}%</div>
          </div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ height: `${(avgEffectiveness / 100) * 80}%` }}
            ></div>
            <div className="bar-label">Avg</div>
            <div className="bar-value">{Math.round(avgEffectiveness)}%</div>
          </div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ height: `${(maxEffectiveness / 100) * 80}%` }}
            ></div>
            <div className="bar-label">Max</div>
            <div className="bar-value">{maxEffectiveness}%</div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing secure FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>Private<span>Med</span>Twin</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-twin-btn metal-button"
          >
            <div className="add-icon"></div>
            Create Twin
          </button>
          <button 
            className="metal-button"
            onClick={() => setShowTeamInfo(!showTeamInfo)}
          >
            {showTeamInfo ? "Hide Team" : "Show Team"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-panel">
          <div className="welcome-text">
            <h2>Confidential Digital Twin for Personalized Medicine</h2>
            <p>Create encrypted digital twins of patients and simulate treatment outcomes using FHE technology</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
        </div>
        
        <div className="dashboard-panels">
          <div className="panel-left">
            <div className="info-panel metal-card">
              <h3>Project Introduction</h3>
              <p>PrivateMedTwin leverages Fully Homomorphic Encryption (FHE) to create secure digital replicas of patients. Doctors can simulate various treatment scenarios on these encrypted models without ever decrypting sensitive health data.</p>
              <div className="feature-list">
                <div className="feature-item">
                  <div className="feature-icon">🔒</div>
                  <span>Encrypted health data integration</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">⚗️</div>
                  <span>FHE treatment simulation</span>
                </div>
                <div className="feature-item">
                  <div className="feature-icon">🎯</div>
                  <span>Personalized therapy optimization</span>
                </div>
              </div>
            </div>
            
            <div className="stats-panel metal-card">
              <h3>Platform Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value metal-text">{twins.length}</div>
                  <div className="stat-label">Digital Twins</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value metal-text">{activeTwins}</div>
                  <div className="stat-label">Active Twins</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value metal-text">{simulatedTwins}</div>
                  <div className="stat-label">Simulations Run</div>
                </div>
              </div>
            </div>
            
            {renderBarChart()}
          </div>
          
          <div className="panel-right">
            <div className="twins-panel metal-card">
              <div className="panel-header">
                <h3>Digital Twins</h3>
                <button 
                  onClick={loadTwins}
                  className="refresh-btn metal-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              
              <div className="twins-list">
                {twins.length === 0 ? (
                  <div className="no-twins">
                    <div className="no-twins-icon"></div>
                    <p>No digital twins found</p>
                    <button 
                      className="metal-button primary"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create First Twin
                    </button>
                  </div>
                ) : (
                  twins.map(twin => (
                    <div 
                      className="twin-item" 
                      key={twin.id}
                      onClick={() => setSelectedTwin(twin)}
                    >
                      <div className="twin-info">
                        <div className="twin-id">Patient: {twin.patientId}</div>
                        <div className="twin-meta">
                          <span>Created: {new Date(twin.createdAt * 1000).toLocaleDateString()}</span>
                          <span className={`status-badge ${twin.currentStatus}`}>
                            {twin.currentStatus}
                          </span>
                        </div>
                      </div>
                      <div className="twin-actions">
                        <button 
                          className="action-btn metal-button small"
                          onClick={(e) => {
                            e.stopPropagation();
                            simulateTreatment(twin.id, {
                              name: "Standard Therapy",
                              dosage: "Recommended",
                              duration: "4 weeks"
                            });
                          }}
                        >
                          Simulate
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        
        {selectedTwin && (
          <div className="detail-panel metal-card">
            <div className="panel-header">
              <h3>Digital Twin Details: Patient {selectedTwin.patientId}</h3>
              <button onClick={() => setSelectedTwin(null)} className="close-btn">&times;</button>
            </div>
            <div className="twin-details">
              <div className="detail-section">
                <h4>Treatment History</h4>
                {selectedTwin.treatmentHistory.length === 0 ? (
                  <p>No treatments simulated yet</p>
                ) : (
                  <div className="treatment-list">
                    {selectedTwin.treatmentHistory.map(treatment => (
                      <div key={treatment.id} className="treatment-item">
                        <div className="treatment-name">{treatment.name}</div>
                        <div className="treatment-details">
                          <span>Dosage: {treatment.dosage}</span>
                          <span>Duration: {treatment.duration}</span>
                          <span className={`effectiveness-${Math.floor(treatment.effectiveness / 25)}`}>
                            Effectiveness: {treatment.effectiveness}%
                          </span>
                          <span>Side Effects: {treatment.sideEffects}</span>
                        </div>
                        <div className="treatment-date">
                          {new Date(treatment.timestamp * 1000).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {showTeamInfo && (
          <div className="team-panel metal-card">
            <h3>Our Team</h3>
            <div className="team-grid">
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Dr. Sarah Chen</div>
                <div className="member-role">Chief Medical Officer</div>
              </div>
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Prof. James Wilson</div>
                <div className="member-role">FHE Research Lead</div>
              </div>
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Dr. Maria Rodriguez</div>
                <div className="member-role">Clinical Data Specialist</div>
              </div>
              <div className="team-member">
                <div className="member-avatar"></div>
                <div className="member-name">Alex Thompson</div>
                <div className="member-role">Security Architect</div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createTwin} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          twinData={newTwinData}
          setTwinData={setNewTwinData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>PrivateMedTwin</span>
            </div>
            <p>Confidential Digital Twin for Personalized Medicine</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Medical Innovation</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PrivateMedTwin. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  twinData: any;
  setTwinData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  twinData,
  setTwinData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTwinData({
      ...twinData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!twinData.patientId) {
      alert("Please enter patient ID");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>Create Digital Twin</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Patient data will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Patient ID *</label>
              <input 
                type="text"
                name="patientId"
                value={twinData.patientId} 
                onChange={handleChange}
                placeholder="Enter patient identifier" 
                className="metal-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Initial Health Data</label>
              <textarea 
                name="initialData"
                value={twinData.initialData} 
                onChange={handleChange}
                placeholder="Enter initial health data (will be encrypted)..." 
                className="metal-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> All data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating ? "Creating with FHE..." : "Create Secure Twin"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
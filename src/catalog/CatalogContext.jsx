import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client';
const CatalogContext=createContext(null);
export function CatalogProvider({children}){const[catalog,setCatalog]=useState({chapters:[],promptGuides:[],aiEditPresets:[]});const[loading,setLoading]=useState(true);const[error,setError]=useState('');useEffect(()=>{apiFetch('/catalog').then(setCatalog).catch(reason=>setError(reason.message)).finally(()=>setLoading(false))},[]);const value=useMemo(()=>({...catalog,loading,error,categories:['Tous',...new Set(catalog.chapters.map(item=>item.category))]}),[catalog,loading,error]);return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>}
export const useCatalog=()=>useContext(CatalogContext);

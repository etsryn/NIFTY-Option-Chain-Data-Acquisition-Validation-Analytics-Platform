Option Explicit


Dim shell
Dim fso

Dim projectDir

Dim pythonExe
Dim excelFile
Dim backendFile
Dim streamlitFile

Dim backendRunning
Dim streamlitRunning

Dim extensionId
Dim launcherUrl

Dim chromeExe


Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")


' ============================================================
' PROJECT DIRECTORY
' ============================================================
'
' setup.vbs is in the project root.
'
' Everything belonging to the project is resolved relative
' to this file.
'
' ============================================================

projectDir = fso.GetParentFolderName( _
    WScript.ScriptFullName _
)


' ============================================================
' PYTHON
' ============================================================
'
' Python is an installed dependency.
'
' ============================================================

pythonExe = _
    shell.ExpandEnvironmentStrings( _
        "%LOCALAPPDATA%" _
    ) & _
    "\Programs\Python\Python311\python.exe"


' ============================================================
' PROJECT FILES
' ============================================================

excelFile = fso.BuildPath( _
    projectDir, _
    "live_market_feed.xlsx" _
)

backendFile = fso.BuildPath( _
    projectDir, _
    "backend\server.py" _
)

streamlitFile = fso.BuildPath( _
    projectDir, _
    "streamlit_app.py" _
)


' ============================================================
' STABLE EXTENSION ID
' ============================================================

extensionId = _
    "dphdldgdhlepfnegemjpkncocbdjbdii"


' ============================================================
' BASIC FILE CHECKS
' ============================================================

If Not fso.FileExists(pythonExe) Then

    MsgBox _
        "Python 3.11 executable not found:" & _
        vbCrLf & vbCrLf & _
        pythonExe, _
        vbCritical, _
        "NIFTY Launcher"

    WScript.Quit 1

End If


If Not fso.FileExists(excelFile) Then

    MsgBox _
        "Excel workbook not found:" & _
        vbCrLf & vbCrLf & _
        excelFile, _
        vbCritical, _
        "NIFTY Launcher"

    WScript.Quit 1

End If


If Not fso.FileExists(backendFile) Then

    MsgBox _
        "Backend file not found:" & _
        vbCrLf & vbCrLf & _
        backendFile, _
        vbCritical, _
        "NIFTY Launcher"

    WScript.Quit 1

End If


If Not fso.FileExists(streamlitFile) Then

    MsgBox _
        "Streamlit file not found:" & _
        vbCrLf & vbCrLf & _
        streamlitFile, _
        vbCritical, _
        "NIFTY Launcher"

    WScript.Quit 1

End If


' ============================================================
' 1. ENSURE EXCEL WORKBOOK
' ============================================================

If Not IsWorkbookOpen(excelFile) Then

    shell.Run _
        """" & excelFile & """", _
        1, _
        False

    WScript.Sleep 3000

End If


' ============================================================
' 2. ENSURE BACKEND
' ============================================================

backendRunning = IsHttpAlive( _
    "http://127.0.0.1:5000/heartbeat" _
)


If Not backendRunning Then

    shell.Run _
        """" & pythonExe & _
        """ """ & backendFile & """", _
        0, _
        False

    WScript.Sleep 2500

End If


' ============================================================
' 3. ENSURE STREAMLIT SERVER
' ============================================================

streamlitRunning = IsHttpAlive( _
    "http://127.0.0.1:8501/" _
)


If Not streamlitRunning Then

    shell.Run _
        """" & pythonExe & _
        """ -m streamlit run """ & _
        streamlitFile & """", _
        0, _
        False

    WScript.Sleep 5000

End If


' ============================================================
' 4. FIND GOOGLE CHROME
' ============================================================

chromeExe = FindChromePath()


If chromeExe = "" Then

    MsgBox _
        "Google Chrome executable could not be found." & _
        vbCrLf & vbCrLf & _
        "The launcher requires Google Chrome.", _
        vbCritical, _
        "NIFTY Launcher"

    WScript.Quit 1

End If


' ============================================================
' 5. OPEN EXTENSION LAUNCHER THROUGH CHROME
' ============================================================
'
' IMPORTANT:
'
' We do NOT pass chrome-extension:// directly to Windows.
'
' Instead:
'
'     setup.vbs
'          ↓
'     chrome.exe
'          ↓
'     launcher.html
'
' Chrome itself handles the extension URL.
'
' ============================================================

launcherUrl = _
    "chrome-extension://" & _
    extensionId & _
    "/launcher.html"


shell.Run _
    """" & chromeExe & _
    """ """ & launcherUrl & """", _
    1, _
    False


' ============================================================
' CLEANUP
' ============================================================

Set shell = Nothing
Set fso = Nothing

WScript.Quit 0


' ============================================================
' FUNCTION: CHECK EXACT EXCEL WORKBOOK
' ============================================================

Function IsWorkbookOpen(targetPath)

    Dim excelApp
    Dim wb


    IsWorkbookOpen = False


    On Error Resume Next


    Set excelApp = GetObject( _
        , _
        "Excel.Application" _
    )


    If Err.Number <> 0 Then

        Err.Clear

        Set excelApp = Nothing

    End If


    If Not excelApp Is Nothing Then

        For Each wb In excelApp.Workbooks

            If LCase(wb.FullName) = _
               LCase(targetPath) Then

                IsWorkbookOpen = True

                Exit For

            End If

        Next

    End If


    Set excelApp = Nothing


    On Error GoTo 0

End Function


' ============================================================
' FUNCTION: CHECK HTTP SERVICE
' ============================================================

Function IsHttpAlive(url)

    Dim request


    IsHttpAlive = False


    On Error Resume Next


    Set request = _
        CreateObject( _
            "MSXML2.XMLHTTP" _
        )


    request.Open _
        "GET", _
        url, _
        False


    request.setRequestHeader _
        "Cache-Control", _
        "no-cache"


    request.Send


    If Err.Number = 0 Then

        If request.Status >= 200 And _
           request.Status < 500 Then

            IsHttpAlive = True

        End If

    End If


    Set request = Nothing


    Err.Clear


    On Error GoTo 0

End Function


' ============================================================
' FUNCTION: FIND GOOGLE CHROME
' ============================================================

Function FindChromePath()

    Dim candidate


    FindChromePath = ""


    ' --------------------------------------------------------
    ' 1. Current user's Chrome
    ' --------------------------------------------------------

    candidate = _
        shell.ExpandEnvironmentStrings( _
            "%LOCALAPPDATA%" _
        ) & _
        "\Google\Chrome\Application\chrome.exe"


    If fso.FileExists(candidate) Then

        FindChromePath = candidate

        Exit Function

    End If


    ' --------------------------------------------------------
    ' 2. System-wide Chrome
    ' --------------------------------------------------------

    candidate = _
        shell.ExpandEnvironmentStrings( _
            "%PROGRAMFILES%" _
        ) & _
        "\Google\Chrome\Application\chrome.exe"


    If fso.FileExists(candidate) Then

        FindChromePath = candidate

        Exit Function

    End If


    ' --------------------------------------------------------
    ' 3. 32-bit Chrome on 64-bit Windows
    ' --------------------------------------------------------

    candidate = _
        shell.ExpandEnvironmentStrings( _
            "%PROGRAMFILES(x86)%" _
        ) & _
        "\Google\Chrome\Application\chrome.exe"


    If fso.FileExists(candidate) Then

        FindChromePath = candidate

        Exit Function

    End If

End Function
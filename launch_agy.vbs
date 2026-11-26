Option Explicit
Dim fso, sh, suiteDir, scriptPath, pyExe, argStr, i, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

suiteDir = fso.GetParentFolderName(WScript.ScriptFullName)
scriptPath = fso.BuildPath(suiteDir, "agy_suite.py")

' Prefer pythonw.exe in PATH (no console flash), fallback to python.exe
pyExe = "pythonw.exe"

argStr = ""
For i = 0 To WScript.Arguments.Count - 1
    argStr = argStr & " """ & WScript.Arguments(i) & """"
Next

cmd = """" & pyExe & """ """ & scriptPath & """ launch --from-launcher" & argStr
On Error Resume Next
sh.Run cmd, 0, False
If Err.Number <> 0 Then
    Err.Clear
    cmd = "python.exe """ & scriptPath & """ launch --from-launcher" & argStr
    sh.Run cmd, 0, False
End If
On Error GoTo 0
